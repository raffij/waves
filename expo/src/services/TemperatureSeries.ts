import { TideClock } from './TideClock';
import type { TemperatureData } from './WaveAPIClient';

// Real (measured) and "feels like" (apparent — factors in wind chill and
// humidity) air temperature, °C. Point-in-time hourly readings, so linearly
// interpolated between samples like wind/wave, not bucketed like rain.
export class TemperatureSeries {
  private readonly points: Array<{ time: Date; temp: number | null; feelsLike: number | null }>;

  constructor(data: TemperatureData) {
    this.points = data.time.map((timeStr, i) => ({
      time: TideClock.parseLondonWallTime(timeStr) ?? new Date(Number.NaN),
      temp: data.temperature[i] ?? null,
      feelsLike: data.apparent_temperature[i] ?? null,
    }));
  }

  private interpolate(date: Date, pick: (p: (typeof this.points)[0]) => number | null): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return pick(p);
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    const beforeValue = before ? pick(before) : null;
    const afterValue = after ? pick(after) : null;
    if (!before || !after || beforeValue === null || afterValue === null) {
      return beforeValue ?? afterValue ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return beforeValue + (afterValue - beforeValue) * ratio;
  }

  tempAt(date: Date): number | null {
    return this.interpolate(date, (p) => p.temp);
  }

  feelsLikeAt(date: Date): number | null {
    return this.interpolate(date, (p) => p.feelsLike);
  }

  samplesEvery(
    minutes: number,
    from: Date,
    to: Date,
  ): Array<{ time: Date; temp: number | null; feelsLike: number | null }> {
    const samples: Array<{ time: Date; temp: number | null; feelsLike: number | null }> = [];
    let current = from.getTime();
    const interval = minutes * 60 * 1000;

    while (current <= to.getTime()) {
      const time = new Date(current);
      samples.push({ time, temp: this.tempAt(time), feelsLike: this.feelsLikeAt(time) });
      current += interval;
    }

    return samples;
  }

  // Real-temperature high/low for the day — what "feels like" the day was
  // is the chart's job, but a day's forecast high/low is conventionally the
  // measured reading, not the apparent one.
  dailyExtremes(date: Date): { high: number | null; low: number | null } {
    const dayStart = TideClock.londonDateAtHour(date, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1000);

    const dayPoints = this.points.filter((p) => p.time >= dayStart && p.time <= dayEnd && p.temp !== null);
    if (dayPoints.length === 0) return { high: null, low: null };

    const temps = dayPoints.map((p) => p.temp as number);
    return { high: Math.max(...temps), low: Math.min(...temps) };
  }
}
