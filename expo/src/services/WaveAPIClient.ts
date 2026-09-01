import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CloudCoverData,
  DaylightData,
  PrecipitationData,
  SunBrightnessData,
  TemperatureData,
  WaveData,
  WindData,
} from '../models/WeatherModels';

const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface WaveDataResult {
  data: WaveData;
  wind: WindData | null;
  precipitation: PrecipitationData | null;
  daylight: DaylightData | null;
  temperature: TemperatureData | null;
  sunBrightness: SunBrightnessData | null;
  cloudCover: CloudCoverData | null;
  fetchedAt: Date;
}

export class WaveAPIClient {
  constructor(
    private readonly locationId: string,
    private readonly latitude: string,
    private readonly longitude: string,
  ) {}

  private get cacheDataKey(): string {
    // Keyed on the actual request parameters (not just locationId) so an
    // edited latitude/longitude for a location can't keep serving stale
    // data for the old coordinates out of the cache.
    return `wave-hastings-wave-cache-${this.locationId}-${this.latitude}-${this.longitude}`;
  }

  async loadWaveData(): Promise<WaveDataResult | null> {
    const cached = await this.getCached();
    if (cached) return cached;
    return this.fetchAndCache();
  }

  async forceRefresh(): Promise<WaveDataResult | null> {
    await AsyncStorage.removeItem(this.cacheDataKey);
    return this.fetchAndCache();
  }

  private async getCached(): Promise<WaveDataResult | null> {
    try {
      const cached = await AsyncStorage.getItem(this.cacheDataKey);
      if (!cached) return null;

      const { data, wind, precipitation, daylight, temperature, sunBrightness, cloudCover, cachedAt } =
        JSON.parse(cached);
      const age = Date.now() - cachedAt;
      if (age > CACHE_MAX_AGE_MS) {
        await AsyncStorage.removeItem(this.cacheDataKey);
        return null;
      }

      // `daylight`/`temperature`/`sunBrightness`/`cloudCover` are absent from
      // entries cached before each was added — the key is deliberately not
      // versioned, so coalesce to null and let the next fetch (or the
      // hook's 1h stale top-up) fill it in.
      return {
        data,
        wind: wind ?? null,
        precipitation: precipitation ?? null,
        daylight: daylight ?? null,
        temperature: temperature ?? null,
        sunBrightness: sunBrightness ?? null,
        cloudCover: cloudCover ?? null,
        fetchedAt: new Date(cachedAt),
      };
    } catch {
      return null;
    }
  }

  private async fetchAndCache(): Promise<WaveDataResult | null> {
    const result = await this.fetch();
    if (!result) return null;

    try {
      await AsyncStorage.setItem(
        this.cacheDataKey,
        JSON.stringify({
          data: result.data,
          wind: result.wind,
          precipitation: result.precipitation,
          daylight: result.daylight,
          temperature: result.temperature,
          sunBrightness: result.sunBrightness,
          cloudCover: result.cloudCover,
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

    // Wave (marine) data is essential; wind/precipitation/temperature/sun
    // are a nice-to-have overlay. Fetched independently so a forecast-API
    // request failing (network hiccup, provider outage, client-side filter)
    // never takes wave data down with it — see the Promise.all bug this
    // replaced.
    const { wind, precipitation, daylight, temperature, sunBrightness, cloudCover } = await this.fetchForecastExtras(
      startDate,
      endDate,
    );

    return {
      data: {
        time: marineJson.hourly.time,
        wave_height: marineJson.hourly.wave_height,
      },
      wind,
      precipitation,
      daylight,
      temperature,
      sunBrightness,
      cloudCover,
      fetchedAt: new Date(),
    };
  }

  private async fetchWave(
    startDate: string,
    endDate: string,
  ): Promise<{ hourly: { time: string[]; wave_height: (number | null)[] } } | null> {
    const marineUrl = new URL('https://marine-api.open-meteo.com/v1/marine');
    marineUrl.searchParams.append('latitude', this.latitude);
    marineUrl.searchParams.append('longitude', this.longitude);
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

  // wind_speed_10m, precipitation, temperature_2m/apparent_temperature,
  // shortwave_radiation and cloud_cover all live on the general Forecast
  // API, not the Marine API (the Marine API silently accepts
  // wind_speed_10m but returns all nulls, and doesn't offer the rest at
  // all). Fetched together in one request since they all come from the
  // same endpoint, along with the daily sunrise/sunset the day-insights
  // block uses to bound "the day". Unlike met.no, this supports
  // start_date/end_date, so all of it covers the same yesterday-to-+5-days
  // range as wave instead of forecast-only.
  private async fetchForecastExtras(
    startDate: string,
    endDate: string,
  ): Promise<{
    wind: WindData | null;
    precipitation: PrecipitationData | null;
    daylight: DaylightData | null;
    temperature: TemperatureData | null;
    sunBrightness: SunBrightnessData | null;
    cloudCover: CloudCoverData | null;
  }> {
    const empty = {
      wind: null,
      precipitation: null,
      daylight: null,
      temperature: null,
      sunBrightness: null,
      cloudCover: null,
    };

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.append('latitude', this.latitude);
    url.searchParams.append('longitude', this.longitude);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append(
      'hourly',
      'wind_speed_10m,precipitation,temperature_2m,apparent_temperature,shortwave_radiation,cloud_cover',
    );
    url.searchParams.append('daily', 'sunrise,sunset');
    url.searchParams.append('wind_speed_unit', 'mph');
    url.searchParams.append('temperature_unit', 'celsius');
    url.searchParams.append('timezone', 'Europe/London');

    try {
      const response = await fetch(url.toString());
      if (!response.ok) return empty;

      const json = (await response.json()) as {
        hourly: {
          time: string[];
          wind_speed_10m: (number | null)[];
          precipitation: (number | null)[];
          temperature_2m: (number | null)[];
          apparent_temperature: (number | null)[];
          shortwave_radiation: (number | null)[];
          cloud_cover: (number | null)[];
        };
        daily?: { time: string[]; sunrise: string[]; sunset: string[] };
      };
      return {
        wind: { time: json.hourly.time, wind_speed: json.hourly.wind_speed_10m },
        precipitation: { time: json.hourly.time, precipitation: json.hourly.precipitation },
        daylight: json.daily ? { time: json.daily.time, sunrise: json.daily.sunrise, sunset: json.daily.sunset } : null,
        temperature: {
          time: json.hourly.time,
          temperature: json.hourly.temperature_2m,
          apparent_temperature: json.hourly.apparent_temperature,
        },
        sunBrightness: { time: json.hourly.time, shortwave_radiation: json.hourly.shortwave_radiation },
        cloudCover: { time: json.hourly.time, cloud_cover: json.hourly.cloud_cover },
      };
    } catch {
      return empty;
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
