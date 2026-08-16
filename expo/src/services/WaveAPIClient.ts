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
    const marineJson = await this.fetchWave();
    if (!marineJson) return null;

    const wind = await this.fetchWind();

    return {
      data: {
        time: marineJson.hourly.time,
        wave_height: marineJson.hourly.wave_height,
      },
      wind,
      fetchedAt: new Date(),
    };
  }

  // Wave (marine) data is essential; wind is a nice-to-have overlay fetched
  // from an entirely separate provider (met.no, not Open-Meteo) on its own
  // timeline. They're fetched and cached independently so a wind request
  // failing (blocked by a client-side filter, network hiccup, provider
  // outage) never takes wave data down with it.
  private async fetchWave(): Promise<{ hourly: { time: string[]; wave_height: (number | null)[] } } | null> {
    const now = new Date();
    const startDate = this.formatDate(new Date(now.getTime() - 86_400_000));
    const endDate = this.formatDate(new Date(now.getTime() + 5 * 86_400_000));

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

  // met.no's Locationforecast: free, no API key, hourly resolution for the
  // first ~3 days then every 6 hours out to ~9 days. No historical data,
  // but the app never needs wind further back than "now".
  private async fetchWind(): Promise<WindData | null> {
    const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
    url.searchParams.append('lat', LATITUDE);
    url.searchParams.append('lon', LONGITUDE);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const json = (await response.json()) as {
        properties: {
          timeseries: Array<{ time: string; data: { instant: { details: { wind_speed?: number } } } }>;
        };
      };

      const time: string[] = [];
      const wind_speed: (number | null)[] = [];
      for (const point of json.properties.timeseries) {
        time.push(point.time);
        wind_speed.push(point.data.instant.details.wind_speed ?? null);
      }

      return { time, wind_speed };
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
