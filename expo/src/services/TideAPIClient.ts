import AsyncStorage from '@react-native-async-storage/async-storage';
import { TideResponse } from '../models/TideModels';

const CACHE_DATA_KEY = 'wave-hastings-tide-cache';
const CACHE_TIMESTAMP_KEY = 'wave-hastings-tide-cache-timestamp';

export interface TideDataResult {
  data: TideResponse;
  fetchedAt: Date;
}

// Fetches tide data with a local cache, mirroring the macOS widget's disk cache.
// The free TideCheck tier allows 50 requests/day; a mobile app opened often
// would blow through that fast without caching.
export class TideAPIClient {
  constructor(
    private readonly stationId: string,
    private readonly apiKey: string,
    private readonly cacheMaxAgeMs: number = 6 * 60 * 60 * 1000
  ) {}

  async loadTideData(): Promise<TideDataResult | null> {
    const cached = await this.readCache();
    if (cached && Date.now() - cached.fetchedAt.getTime() < this.cacheMaxAgeMs) {
      return cached;
    }

    const fresh = await this.fetchFromNetwork();
    if (fresh) {
      const fetchedAt = new Date();
      await this.writeCache(fresh, fetchedAt);
      return { data: fresh, fetchedAt };
    }

    // Network/API failure: fall back to a stale cache rather than showing nothing.
    return cached;
  }

  async forceRefresh(): Promise<TideDataResult | null> {
    await AsyncStorage.multiRemove([CACHE_DATA_KEY, CACHE_TIMESTAMP_KEY]);
    return this.loadTideData();
  }

  private async fetchFromNetwork(): Promise<TideResponse | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`https://tidecheck.com/api/station/${this.stationId}/tides`, {
        headers: { 'X-API-Key': this.apiKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      return (await response.json()) as TideResponse;
    } catch {
      return null;
    }
  }

  private async readCache(): Promise<TideDataResult | null> {
    try {
      const [json, timestamp] = await Promise.all([
        AsyncStorage.getItem(CACHE_DATA_KEY),
        AsyncStorage.getItem(CACHE_TIMESTAMP_KEY),
      ]);
      if (!json || !timestamp) return null;
      return { data: JSON.parse(json) as TideResponse, fetchedAt: new Date(timestamp) };
    } catch {
      return null;
    }
  }

  private async writeCache(data: TideResponse, fetchedAt: Date): Promise<void> {
    await Promise.all([
      AsyncStorage.setItem(CACHE_DATA_KEY, JSON.stringify(data)),
      AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, fetchedAt.toISOString()),
    ]);
  }
}
