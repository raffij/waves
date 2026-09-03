import type { SeaTemperatureData } from '../models/WeatherModels';
import { TideClock } from './TideClock';

// Sea surface temperature, °C. Point-in-time hourly readings, linearly
// interpolated between samples like air temperature/wind/wave.
export class SeaTemperatureSeries {
  private readonly points: Array<{ time: Date; temp: number | null }>;

  constructor(data: SeaTemperatureData) {
    this.points = data.time.map((timeStr, i) => ({
      time: TideClock.parseLondonWallTime(timeStr) ?? new Date(Number.NaN),
      temp: data.sea_surface_temperature[i] ?? null,
    }));
  }

  tempAt(date: Date): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.temp;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    if (!before || !after || before.temp === null || after.temp === null) {
      return before?.temp ?? after?.temp ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return before.temp + (after.temp - before.temp) * ratio;
  }

  dailyExtremes(date: Date): { high: number | null; low: number | null } {
    const dayStart = TideClock.londonDateAtHour(date, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1000);

    const dayPoints = this.points.filter((p) => p.time >= dayStart && p.time <= dayEnd && p.temp !== null);
    if (dayPoints.length === 0) return { high: null, low: null };

    const temps = dayPoints.map((p) => p.temp as number);
    return { high: Math.max(...temps), low: Math.min(...temps) };
  }
}
