import type { WaveData } from '../models/WeatherModels';
import { TideClock } from './TideClock';
import type { Trend } from './TideSeries';

// Below this, an hour-over-hour change reads as noise rather than a
// genuine rise or fall (wave height typically moves gradually, 0.2-1.5m).
const STEADY_THRESHOLD_M = 0.05;

export class WaveSeries {
  private readonly points: Array<{ time: Date; height: number | null }>;

  constructor(data: WaveData) {
    this.points = data.time.map((timeStr, i) => ({
      time: TideClock.parseLondonWallTime(timeStr) ?? new Date(Number.NaN),
      height: data.wave_height[i] ?? null,
    }));
  }

  heightAt(date: Date): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.height;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    if (!before || !after || before.height === null || after.height === null) {
      return before?.height ?? after?.height ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return before.height + (after.height - before.height) * ratio;
  }

  samplesEvery(minutes: number, from: Date, to: Date): Array<{ time: Date; height: number | null }> {
    const samples: Array<{ time: Date; height: number | null }> = [];
    let current = from.getTime();
    const interval = minutes * 60 * 1000;

    while (current <= to.getTime()) {
      const time = new Date(current);
      const height = this.heightAt(time);
      samples.push({ time, height });
      current += interval;
    }

    return samples;
  }

  dailyExtremes(date: Date): { high: number | null; low: number | null } {
    const dayStart = TideClock.londonDateAtHour(date, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1000);

    const dayPoints = this.points.filter((p) => p.time >= dayStart && p.time <= dayEnd && p.height !== null);

    if (dayPoints.length === 0) return { high: null, low: null };

    const heights = dayPoints.map((p) => p.height as number);
    return {
      high: Math.max(...heights),
      low: Math.min(...heights),
    };
  }

  trend(date: Date): Trend {
    const now = this.heightAt(date);
    const past = this.heightAt(new Date(date.getTime() - 60 * 60 * 1000));
    if (now === null || past === null) return 'unknown';

    const diff = now - past;
    if (Math.abs(diff) < STEADY_THRESHOLD_M) return 'steady';
    return diff > 0 ? 'rising' : 'falling';
  }
}
