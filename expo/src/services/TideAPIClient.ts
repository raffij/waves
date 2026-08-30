import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TideResponse } from '../models/TideModels';

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
    private readonly cacheMaxAgeMs: number = 6 * 60 * 60 * 1000,
  ) {}

  private get cacheDataKey(): string {
    return `wave-hastings-tide-cache-${this.stationId}`;
  }

  private get cacheTimestampKey(): string {
    return `wave-hastings-tide-cache-timestamp-${this.stationId}`;
  }

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
    await AsyncStorage.multiRemove([this.cacheDataKey, this.cacheTimestampKey]);
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
        AsyncStorage.getItem(this.cacheDataKey),
        AsyncStorage.getItem(this.cacheTimestampKey),
      ]);
      if (!json || !timestamp) return null;
      return { data: JSON.parse(json) as TideResponse, fetchedAt: new Date(timestamp) };
    } catch {
      return null;
    }
  }

  private async writeCache(data: TideResponse, fetchedAt: Date): Promise<void> {
    await Promise.all([
      AsyncStorage.setItem(this.cacheDataKey, JSON.stringify(data)),
      AsyncStorage.setItem(this.cacheTimestampKey, fetchedAt.toISOString()),
    ]);
  }
}
