import AsyncStorage from '@react-native-async-storage/async-storage';

// Bathing-water pollution status for the selected location, driven by the
// Environment Agency's Bathing Water Quality open data
// (environment.data.gov.uk) — the same source and query shape
// tools/swim-card/src/beachQuality.mjs uses for its per-beach flags.
//
// ⚠️ UNVERIFIED INTEGRATION, same caveat as beachQuality.mjs: this was built
// from training knowledge of environment.data.gov.uk's other Linked Data
// APIs (e.g. flood-monitoring) querying by lat/long/dist, not from confirmed
// bathing-water API docs, and hasn't been run against the real service. Run
// this for real and fix whatever's wrong: the query URL, the field names
// read out of the response, or the classification -> status mapping.
//
// Nothing here ever reports "clear" on a guess: any request failure, an
// unrecognised response shape, or no bathing water found near the
// location's coordinates all resolve to 'unknown', never 'clear' — a wrong
// "unknown" costs the card an icon; a wrong "clear" is a false safety claim.

const EA_BATHING_WATER_BASE = 'https://environment.data.gov.uk/doc/bathing-water.json';
const SEARCH_RADIUS_KM = 2;
const FETCH_TIMEOUT_MS = 8000;

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
    const url = new URL(EA_BATHING_WATER_BASE);
    url.searchParams.set('lat', this.latitude);
    url.searchParams.set('long', this.longitude);
    url.searchParams.set('dist', String(SEARCH_RADIUS_KM));
    url.searchParams.set('_view', 'default');
    url.searchParams.set('_pageSize', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) return this.unknownResult();

      const body = await response.json();
      const item = body?.items?.[0] ?? body?.result?.items?.[0] ?? null;
      const classificationRaw = item?.currentClassification?.classification?.label ?? item?.classification ?? null;
      const classification = typeof classificationRaw === 'string' ? classificationRaw.toLowerCase() : null;
      const siteName = typeof item?.label === 'string' ? item.label : null;

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
