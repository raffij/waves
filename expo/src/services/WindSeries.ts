import { TideClock } from './TideClock';
import type { Trend } from './TideSeries';
import type { WindData } from './WaveAPIClient';

// Below this, an hour-over-hour change reads as noise rather than a
// genuine rise or fall in wind speed.
const STEADY_THRESHOLD_MPH = 0.7;

export class WindSeries {
  private readonly points: Array<{ time: Date; speed: number | null }>;

  constructor(data: WindData) {
    this.points = data.time.map((t, i) => ({
      time: new Date(t),
      speed: data.wind_speed[i] ?? null,
    }));
  }

  speedAt(date: Date): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.speed;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    if (!before || !after || before.speed === null || after.speed === null) {
      return before?.speed ?? after?.speed ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return before.speed + (after.speed - before.speed) * ratio;
  }

  samplesEvery(minutes: number, from: Date, to: Date): Array<{ time: Date; speed: number | null }> {
    const samples: Array<{ time: Date; speed: number | null }> = [];
    let current = from.getTime();
    const interval = minutes * 60 * 1000;

    while (current <= to.getTime()) {
      const time = new Date(current);
      const speed = this.speedAt(time);
      samples.push({ time, speed });
      current += interval;
    }

    return samples;
  }

  dailyExtremes(date: Date): { high: number | null; low: number | null } {
    const dayStart = TideClock.londonDateAtHour(date, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1000);

    const dayPoints = this.points.filter((p) => p.time >= dayStart && p.time <= dayEnd && p.speed !== null);

    if (dayPoints.length === 0) return { high: null, low: null };

    const speeds = dayPoints.map((p) => p.speed as number);
    return {
      high: Math.max(...speeds),
      low: Math.min(...speeds),
    };
  }

  trend(date: Date): Trend {
    const now = this.speedAt(date);
    const past = this.speedAt(new Date(date.getTime() - 60 * 60 * 1000));
    if (now === null || past === null) return 'unknown';

    const diff = now - past;
    if (Math.abs(diff) < STEADY_THRESHOLD_MPH) return 'steady';
    return diff > 0 ? 'rising' : 'falling';
  }
}
