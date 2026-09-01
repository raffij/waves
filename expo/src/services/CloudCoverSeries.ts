import type { CloudCoverData } from '../models/WeatherModels';
import { TideClock } from './TideClock';

// Total sky cloud cover, % (0 clear – 100 fully overcast). Point-in-time
// hourly readings, interpolated like wind/wave/sun brightness.
export class CloudCoverSeries {
  private readonly points: Array<{ time: Date; percent: number | null }>;

  constructor(data: CloudCoverData) {
    this.points = data.time.map((timeStr, i) => ({
      time: TideClock.parseLondonWallTime(timeStr) ?? new Date(Number.NaN),
      percent: data.cloud_cover[i] ?? null,
    }));
  }

  coverageAt(date: Date): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.percent;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    if (!before || !after || before.percent === null || after.percent === null) {
      return before?.percent ?? after?.percent ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return before.percent + (after.percent - before.percent) * ratio;
  }

  samplesEvery(minutes: number, from: Date, to: Date): Array<{ time: Date; percent: number | null }> {
    const samples: Array<{ time: Date; percent: number | null }> = [];
    let current = from.getTime();
    const interval = minutes * 60 * 1000;

    while (current <= to.getTime()) {
      const time = new Date(current);
      samples.push({ time, percent: this.coverageAt(time) });
      current += interval;
    }

    return samples;
  }
}
