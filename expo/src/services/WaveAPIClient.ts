import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TideResponse } from '../models/TideModels';

const CACHE_DATA_KEY = 'wave-hastings-wave-cache';
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface WaveData {
  time: string[];
  wave_height: (number | null)[];
}

export interface WaveDataResult {
  data: WaveData;
  fetchedAt: Date;
}

export class WaveAPIClient {
  constructor(private readonly stationId: string = 'hastings_pier') {}

  async loadWaveData(): Promise<WaveDataResult | null> {
    const cached = await this.getCached();
    if (cached) return cached;
    return this.fetchAndCache();
  }

  async forceRefresh(): Promise<WaveDataResult | null> {
    await AsyncStorage.removeItem(CACHE_DATA_KEY);
    return this.fetchAndCache();
  }

  private async getCached(): Promise<WaveDataResult | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_DATA_KEY);
      if (!cached) return null;

      const { data, cachedAt } = JSON.parse(cached);
      const age = Date.now() - cachedAt;
      if (age > CACHE_MAX_AGE_MS) {
        await AsyncStorage.removeItem(CACHE_DATA_KEY);
        return null;
      }

      return { data, fetchedAt: new Date(cachedAt) };
    } catch {
      return null;
    }
  }

  private async fetchAndCache(): Promise<WaveDataResult | null> {
    const result = await this.fetch();
    if (!result) return null;

    try {
      await AsyncStorage.setItem(
        CACHE_DATA_KEY,
        JSON.stringify({
          data: result.data,
          cachedAt: result.fetchedAt.getTime(),
        })
      );
    } catch {
      // Cache write failed, but we still have the data
    }

    return result;
  }

  private async fetch(): Promise<WaveDataResult | null> {
    const now = new Date();
    const startDate = this.formatDate(new Date(now.getTime() - 86_400_000));
    const endDate = this.formatDate(new Date(now.getTime() + 5 * 86_400_000));

    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.searchParams.append('latitude', '50.86');
    url.searchParams.append('longitude', '0.60');
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append('hourly', 'wave_height');
    url.searchParams.append('timezone', 'Europe/London');

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const json = (await response.json()) as { hourly: WaveData };
      return {
        data: json.hourly,
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
