import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_DATA_KEY = 'wave-hastings-wave-cache';
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface WaveData {
  time: string[];
  wave_height: (number | null)[];
  wind_speed?: (number | null)[];
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

    const marineUrl = new URL('https://marine-api.open-meteo.com/v1/marine');
    marineUrl.searchParams.append('latitude', '50.86');
    marineUrl.searchParams.append('longitude', '0.60');
    marineUrl.searchParams.append('start_date', startDate);
    marineUrl.searchParams.append('end_date', endDate);
    marineUrl.searchParams.append('hourly', 'wave_height');
    marineUrl.searchParams.append('timezone', 'Europe/London');

    // wind_speed_10m lives on the general Forecast API, not the Marine API
    // (the Marine API silently accepts the param but returns all nulls).
    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.append('latitude', '50.86');
    forecastUrl.searchParams.append('longitude', '0.60');
    forecastUrl.searchParams.append('start_date', startDate);
    forecastUrl.searchParams.append('end_date', endDate);
    forecastUrl.searchParams.append('hourly', 'wind_speed_10m');
    forecastUrl.searchParams.append('wind_speed_unit', 'ms');
    forecastUrl.searchParams.append('timezone', 'Europe/London');

    // Wave (marine) data is essential; wind is a nice-to-have overlay.
    // Fetching both with Promise.all would mean an ad-blocker or firewall
    // rejecting just the wind request (a real-world occurrence — some
    // client-side blockers flag api.open-meteo.com's generic "api."
    // subdomain even though marine-api.open-meteo.com is left alone)
    // throws away the wave data too. Fetch independently instead, so wave
    // still loads even when wind doesn't.
    let marineJson: { hourly: { time: string[]; wave_height: (number | null)[] } } | null = null;
    try {
      const marineResponse = await fetch(marineUrl.toString());
      if (marineResponse.ok) marineJson = await marineResponse.json();
    } catch {
      // network/blocked — leave marineJson null
    }
    if (!marineJson) return null;

    let windSpeed: (number | null)[] | undefined;
    try {
      const forecastResponse = await fetch(forecastUrl.toString());
      if (forecastResponse.ok) {
        const forecastJson = (await forecastResponse.json()) as {
          hourly: { time: string[]; wind_speed_10m: (number | null)[] };
        };
        windSpeed = forecastJson.hourly.wind_speed_10m;
      }
    } catch {
      // network/blocked — wind stays undefined, wave data is unaffected
    }

    return {
      data: {
        time: marineJson.hourly.time,
        wave_height: marineJson.hourly.wave_height,
        wind_speed: windSpeed,
      },
      fetchedAt: new Date(),
    };
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
