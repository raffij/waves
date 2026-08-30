import { TideClock } from './TideClock';
import type { DaylightData } from './WaveAPIClient';

// Per-day sunrise/sunset, looked up by London calendar day. Open-Meteo
// returns one row per day with a "yyyy-MM-dd" key and local ISO
// sunrise/sunset strings; the key is used verbatim, only the instants are
// parsed (as London wall-clock time, so a non-UK viewer still gets the
// right moment).
export class DaylightSeries {
  private readonly byDate = new Map<string, { sunrise: Date | null; sunset: Date | null }>();

  constructor(data: DaylightData) {
    data.time.forEach((dateKey, i) => {
      this.byDate.set(dateKey, {
        sunrise: data.sunrise[i] ? TideClock.parseLondonWallTime(data.sunrise[i]) : null,
        sunset: data.sunset[i] ? TideClock.parseLondonWallTime(data.sunset[i]) : null,
      });
    });
  }

  sunrise(date: Date): Date | null {
    return this.byDate.get(TideClock.dateKey(date))?.sunrise ?? null;
  }

  sunset(date: Date): Date | null {
    return this.byDate.get(TideClock.dateKey(date))?.sunset ?? null;
  }
}
