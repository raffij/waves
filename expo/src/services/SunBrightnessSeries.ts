import type { SunBrightnessData } from '../models/WeatherModels';
import { TideClock } from './TideClock';

// Shortwave (solar) radiation reaching the ground, W/m² — already accounts
// for cloud cover, so it reads as "how bright it actually is" rather than a
// clear-sky theoretical max. Point-in-time hourly readings, interpolated
// like wind/wave; genuinely 0 overnight rather than missing.
export class SunBrightnessSeries {
  private readonly points: Array<{ time: Date; wattsPerM2: number | null }>;

  constructor(data: SunBrightnessData) {
    this.points = data.time.map((timeStr, i) => ({
      time: TideClock.parseLondonWallTime(timeStr) ?? new Date(Number.NaN),
      wattsPerM2: data.shortwave_radiation[i] ?? null,
    }));
  }

  brightnessAt(date: Date): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.wattsPerM2;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    if (!before || !after || before.wattsPerM2 === null || after.wattsPerM2 === null) {
      return before?.wattsPerM2 ?? after?.wattsPerM2 ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return before.wattsPerM2 + (after.wattsPerM2 - before.wattsPerM2) * ratio;
  }

  samplesEvery(minutes: number, from: Date, to: Date): Array<{ time: Date; wattsPerM2: number | null }> {
    const samples: Array<{ time: Date; wattsPerM2: number | null }> = [];
    let current = from.getTime();
    const interval = minutes * 60 * 1000;

    while (current <= to.getTime()) {
      const time = new Date(current);
      samples.push({ time, wattsPerM2: this.brightnessAt(time) });
      current += interval;
    }

    return samples;
  }

  dailyPeak(date: Date): number | null {
    const dayStart = TideClock.londonDateAtHour(date, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1000);

    const dayPoints = this.points.filter((p) => p.time >= dayStart && p.time <= dayEnd && p.wattsPerM2 !== null);
    if (dayPoints.length === 0) return null;

    return Math.max(...dayPoints.map((p) => p.wattsPerM2 as number));
  }
}
