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
// ⚠️ PARTIALLY VERIFIED, still not run against the real service. This
// session's outbound access to environment.data.gov.uk is blocked, but
// WebSearch (unlike WebFetch) isn't, and confirmed real API documentation:
// - The base endpoint and JSON format
//   (environment.data.gov.uk/doc/bathing-water.json) are correct.
// - The geographic filter is NOT lat/long/dist (that was a guess ported
//   from the flood-monitoring API's query shape, and wrong) — the real API
//   filters by min-/max-samplingPoint.easting/.northing, OSGB36 British
//   National Grid coordinates, not WGS84 lat/long. OsGridRef.ts converts
//   the location's lat/long to easting/northing and queries a bounding box
//   around it, same 2km-radius intent as the original (wrong) `dist` guess.
// - The exact response field names for a site's current classification
//   (guessed below as `latestComplianceAssessment.complianceClassification`
//   plus the older `currentClassification.classification` guess, tried in
//   order) are still unconfirmed — search results mentioned
//   `latestComplianceAssessment...name` in passing but never showed a full
//   example response body to check the `label` vs `name` field. Still
//   never resolves to 'clear' on anything unrecognised, so a wrong guess
//   here costs an icon, not a false safety claim.
//
// See docs/decisions/2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md
// for what changed and why, and run this for real to fix whatever's still
// wrong.

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

// Classifications the EA uses for bathing water compliance, worst to best.
// A live short-term pollution risk advisory (however that surfaces in the
// real response) should also map to 'flagged' once confirmed.
const FLAGGED_CLASSIFICATIONS = new Set(['poor', 'poor water quality']);
const CLEAR_CLASSIFICATIONS = new Set(['excellent', 'good', 'sufficient']);

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
      const item = body?.items?.[0] ?? body?.result?.items?.[0] ?? null;
      // Tried in order, most-likely-real first: none of these field names
      // have been confirmed against a real response body (see header
      // comment) — this stays a guess-chain the same way the pre-fix
      // lat/long/dist query was, just a better-informed one.
      const classificationRaw =
        item?.latestComplianceAssessment?.complianceClassification?.name ??
        item?.latestComplianceAssessment?.complianceClassification?.label ??
        item?.currentClassification?.classification?.label ??
        item?.classification ??
        null;
      const classification = typeof classificationRaw === 'string' ? classificationRaw.toLowerCase() : null;
      const siteName = typeof item?.label === 'string' ? item.label : (item?.name ?? null);

      return {
        status: this.classificationToStatus(classification),
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

  private classificationToStatus(classification: string | null): WaterQualityStatus {
    if (classification === null) return 'unknown';
    if (FLAGGED_CLASSIFICATIONS.has(classification)) return 'flagged';
    if (CLEAR_CLASSIFICATIONS.has(classification)) return 'clear';
    return 'unknown';
  }
}
