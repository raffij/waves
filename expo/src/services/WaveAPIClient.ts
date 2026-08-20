import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_DATA_KEY = 'wave-hastings-wave-cache';
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
const LATITUDE = '50.86';
const LONGITUDE = '0.60';

export interface WaveData {
  time: string[];
  wave_height: (number | null)[];
}

export interface WindData {
  time: string[];
  wind_speed: (number | null)[];
}

export interface WaveDataResult {
  data: WaveData;
  wind: WindData | null;
  fetchedAt: Date;
}

export class WaveAPIClient {
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

      const { data, wind, cachedAt } = JSON.parse(cached);
      const age = Date.now() - cachedAt;
      if (age > CACHE_MAX_AGE_MS) {
        await AsyncStorage.removeItem(CACHE_DATA_KEY);
        return null;
      }

      return { data, wind: wind ?? null, fetchedAt: new Date(cachedAt) };
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
          wind: result.wind,
          cachedAt: result.fetchedAt.getTime(),
        }),
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

    const marineJson = await this.fetchWave(startDate, endDate);
    if (!marineJson) return null;

    // Wave (marine) data is essential; wind is a nice-to-have overlay.
    // Fetched independently so a wind request failing (network hiccup,
    // provider outage, client-side filter) never takes wave data down
    // with it — see the Promise.all bug this replaced.
    const wind = await this.fetchWind(startDate, endDate);

    return {
      data: {
        time: marineJson.hourly.time,
        wave_height: marineJson.hourly.wave_height,
      },
      wind,
      fetchedAt: new Date(),
    };
  }

  private async fetchWave(
    startDate: string,
    endDate: string,
  ): Promise<{ hourly: { time: string[]; wave_height: (number | null)[] } } | null> {
    const marineUrl = new URL('https://marine-api.open-meteo.com/v1/marine');
    marineUrl.searchParams.append('latitude', LATITUDE);
    marineUrl.searchParams.append('longitude', LONGITUDE);
    marineUrl.searchParams.append('start_date', startDate);
    marineUrl.searchParams.append('end_date', endDate);
    marineUrl.searchParams.append('hourly', 'wave_height');
    marineUrl.searchParams.append('timezone', 'Europe/London');

    try {
      const response = await fetch(marineUrl.toString());
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // wind_speed_10m lives on the general Forecast API, not the Marine API
  // (the Marine API silently accepts the param but returns all nulls).
  // Unlike met.no, this supports start_date/end_date, so wind can cover
  // the same yesterday-to-+5-days range as wave instead of forecast-only.
  private async fetchWind(startDate: string, endDate: string): Promise<WindData | null> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.append('latitude', LATITUDE);
    url.searchParams.append('longitude', LONGITUDE);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append('hourly', 'wind_speed_10m');
    url.searchParams.append('wind_speed_unit', 'mph');
    url.searchParams.append('timezone', 'Europe/London');

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const json = (await response.json()) as { hourly: { time: string[]; wind_speed_10m: (number | null)[] } };
      return { time: json.hourly.time, wind_speed: json.hourly.wind_speed_10m };
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
