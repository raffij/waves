import AsyncStorage from '@react-native-async-storage/async-storage';
import { wgs84ToOsGridRef } from './OsGridRef';

// Bathing-water pollution status for the selected location, driven by the
// Environment Agency's Bathing Water Quality open data
// (environment.data.gov.uk/bwq, branded "Swimfo") — the same source and
// endpoint tools/swim-card/src/beachQuality.mjs uses for its per-beach
// flags.
//
// The request goes through waves-api.giraffi.dev/ea/... — a narrow
// allowlisted Cloudflare Worker (workers/waves-api/) that forwards to
// environment.data.gov.uk and adds the CORS headers the EA doesn't send.
// That's what lets the web build read this API at all; native iOS/Android
// aren't subject to CORS but route through the same proxy so there's one
// request path and one shared 6h edge cache. See
// docs/decisions/2026-09-06-cloudflare-worker-ea-proxy.md (which supersedes
// the earlier "skip the fetch on web" decision).
//
// The geographic filter is min-/max-samplingPoint.easting/.northing —
// OSGB36 British National Grid coordinates, not WGS84 lat/long.
// OsGridRef.ts converts the location's lat/long to easting/northing and
// queries a ~2km bounding box around it. See
// docs/decisions/2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md.
//
// Response shape CONFIRMED 2026-09-06 against a real body — see
// __fixtures__/bathing-water-morecambe-south.json and this file's tests.
// The single list request embeds everything we need (contrary to an
// earlier worry that the classification was one fetch further on). The
// EA's Linked-Data API returns, per `result.items[]`:
// - `latestComplianceAssessment.complianceClassification.name._value` —
//   the annual rBWD rating: "Excellent" | "Good" | "Sufficient" | "Poor".
// - `latestRiskPrediction.riskLevel.name._value` — today's short-term
//   pollution (STP) advisory: "normal" | "increased". Treated as an
//   override in the unsafe direction only (see classificationToStatus).
// - `name._value` — the bathing water's name.
// Human-readable strings are wrapped as
// `{ _value, _datatype: "langString", _lang }`, sometimes inside a
// one-element array; readLangString() unwraps both.
// See docs/decisions/2026-09-06-bathing-water-status-from-single-list-response.md.
//
// Safety property, unchanged: nothing here resolves to 'clear' on an
// unrecognised value. A request failure, an unexpected shape, or no
// bathing water near the coordinates all degrade to 'unknown' — a wrong
// 'unknown' costs an icon; a wrong 'clear' would be a false safety claim.

// Allowlisted proxy path on the Waves API Worker (workers/waves-api/) —
// maps 1:1 onto https://environment.data.gov.uk/doc/bathing-water.json.
const EA_BATHING_WATER_BASE = 'https://waves-api.giraffi.dev/ea/doc/bathing-water.json';
// Matches the original (wrong) `dist=2` guess's intent: a ~2km-radius
// search around the location, expressed as a bounding-box half-width in
// metres since the real API takes an easting/northing box, not a radius.
const SEARCH_RADIUS_METRES = 2000;
const FETCH_TIMEOUT_MS = 8000;

// Rough bounding box for Great Britain (WGS84). The EA's bathing waters are
// England-only, so anything outside this is either a bad/blank coordinate or
// a location this API can't answer for — either way there's nothing to
// fetch. Guards against `Number('')` (=> 0, a valid-looking 0°N/0°E off West
// Africa) and `Number('n/a')` (=> NaN, which the OSGB36 conversion turns
// into `easting=NaN` in the query string).
const GB_BOUNDS = { minLat: 49, maxLat: 61, minLon: -9, maxLon: 2 } as const;

// Matches WaveAPIClient's cache window — a short-term pollution risk
// advisory can lift within a day, so this shouldn't sit on a stale
// "flagged" any longer than the other overlay data does.
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export type WaterQualityStatus = 'clear' | 'flagged' | 'unknown';

export interface WaterQualityResult {
  status: WaterQualityStatus;
  siteName: string | null;
  classification: string | null;
  fetchedAt: Date;
}

// Annual rBWD classifications the EA uses for bathing water compliance.
const FLAGGED_CLASSIFICATIONS = new Set(['poor', 'poor water quality']);
const CLEAR_CLASSIFICATIONS = new Set(['excellent', 'good', 'sufficient']);

// EA short-term-pollution (STP) risk levels (def/bwq-stp/*) that mean
// "don't swim today", whatever the annual rating says. "normal" is the
// all-clear and adds nothing.
const FLAGGED_RISK_LEVELS = new Set(['increased']);

// The EA's Linked-Data API wraps human-readable strings as
// { _value, _datatype: 'langString', _lang }, occasionally inside a
// one-element array, and just once in a while as a bare string. Unwrap all
// three shapes; anything else is null.
function readLangString(field: unknown): string | null {
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return readLangString(field[0]);
  if (field && typeof field === 'object' && typeof (field as { _value?: unknown })._value === 'string') {
    return (field as { _value: string })._value;
  }
  return null;
}

export class WaterQualityClient {
  constructor(
    private readonly locationId: string,
    private readonly latitude: string,
    private readonly longitude: string,
  ) {}

  private get cacheKey(): string {
    // Keyed on the actual request parameters (not just locationId) so an
    // edited latitude/longitude for a location can't keep serving stale
    // data for the old coordinates out of the cache.
    return `wave-hastings-water-quality-cache-${this.locationId}-${this.latitude}-${this.longitude}`;
  }

  async loadWaterQuality(): Promise<WaterQualityResult | null> {
    const cached = await this.getCached();
    if (cached) return cached;
    return this.fetchAndCache();
  }

  async forceRefresh(): Promise<WaterQualityResult | null> {
    await AsyncStorage.removeItem(this.cacheKey);
    return this.fetchAndCache();
  }

  private async getCached(): Promise<WaterQualityResult | null> {
    try {
      const cached = await AsyncStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const { status, siteName, classification, cachedAt } = JSON.parse(cached);
      const age = Date.now() - cachedAt;
      if (age > CACHE_MAX_AGE_MS) {
        await AsyncStorage.removeItem(this.cacheKey);
        return null;
      }

      return {
        status,
        siteName: siteName ?? null,
        classification: classification ?? null,
        fetchedAt: new Date(cachedAt),
      };
    } catch {
      return null;
    }
  }

  private async fetchAndCache(): Promise<WaterQualityResult | null> {
    const result = await this.fetch();

    try {
      await AsyncStorage.setItem(
        this.cacheKey,
        JSON.stringify({
          status: result.status,
          siteName: result.siteName,
          classification: result.classification,
          cachedAt: result.fetchedAt.getTime(),
        }),
      );
    } catch {
      // Cache write failed, but we still have the result
    }

    return result;
  }

  private async fetch(): Promise<WaterQualityResult> {
    // Routed through waves-api.giraffi.dev (workers/waves-api/), which adds
    // the CORS headers the EA omits — so this now runs on web too, not just
    // native. See this file's header comment.
    const lat = Number(this.latitude);
    const lon = Number(this.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < GB_BOUNDS.minLat ||
      lat > GB_BOUNDS.maxLat ||
      lon < GB_BOUNDS.minLon ||
      lon > GB_BOUNDS.maxLon
    ) {
      // A blank or non-GB coordinate — don't build a request with `NaN` (or
      // a nonsense easting/northing) in the query string. Same degrade-to-
      // 'unknown' outcome as any other failure.
      return this.unknownResult();
    }

    const { easting, northing } = wgs84ToOsGridRef(lat, lon);
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return this.unknownResult();

    const url = new URL(EA_BATHING_WATER_BASE);
    url.searchParams.set('min-samplingPoint.easting', String(Math.round(easting - SEARCH_RADIUS_METRES)));
    url.searchParams.set('max-samplingPoint.easting', String(Math.round(easting + SEARCH_RADIUS_METRES)));
    url.searchParams.set('min-samplingPoint.northing', String(Math.round(northing - SEARCH_RADIUS_METRES)));
    url.searchParams.set('max-samplingPoint.northing', String(Math.round(northing + SEARCH_RADIUS_METRES)));
    url.searchParams.set('_view', 'default');
    url.searchParams.set('_pageSize', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) return this.unknownResult();

      const body = await response.json();
      const item = body?.result?.items?.[0] ?? body?.items?.[0] ?? null;

      const classificationRaw = readLangString(item?.latestComplianceAssessment?.complianceClassification?.name);
      const classification = classificationRaw ? classificationRaw.toLowerCase() : null;

      // Today's STP advisory, read alongside the annual rating so an
      // "increased" risk can flag a site whose yearly classification is
      // Good/Excellent.
      const riskLevel = readLangString(item?.latestRiskPrediction?.riskLevel?.name)?.toLowerCase() ?? null;

      const siteName = readLangString(item?.name);

      return {
        status: this.classificationToStatus(classification, riskLevel),
        siteName,
        classification,
        fetchedAt: new Date(),
      };
    } catch {
      return this.unknownResult();
    } finally {
      clearTimeout(timeout);
    }
  }

  private unknownResult(): WaterQualityResult {
    return { status: 'unknown', siteName: null, classification: null, fetchedAt: new Date() };
  }

  private classificationToStatus(classification: string | null, riskLevel: string | null): WaterQualityStatus {
    // A live STP advisory overrides the annual rating, but only in the
    // unsafe direction: an unrecognised risk level never clears a site.
    if (riskLevel !== null && FLAGGED_RISK_LEVELS.has(riskLevel)) return 'flagged';
    if (classification === null) return 'unknown';
    if (FLAGGED_CLASSIFICATIONS.has(classification)) return 'flagged';
    if (CLEAR_CLASSIFICATIONS.has(classification)) return 'clear';
    return 'unknown';
  }
}
