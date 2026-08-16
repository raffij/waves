import type { SeriesPoint } from '../models/TideModels';
import { TideClock } from './TideClock';

export type Trend = 'rising' | 'falling' | 'steady' | 'unknown';

export interface CurrentLevel {
  height: number;
  trend: Trend;
}

export interface HourlySample {
  hour: number;
  height: number | null;
}

export interface TimeSample {
  time: Date;
  height: number | null;
}

type Point = [Date, number];

// Wraps the raw time series: current-level interpolation and sampling for charts.
export class TideSeries {
  private readonly points: Point[];

  constructor(series: SeriesPoint[]) {
    this.points = series
      .map((p): Point | null => {
        const date = TideClock.parseISODate(p.time);
        return date ? [date, p.height] : null;
      })
      .filter((p): p is Point => p !== null)
      .sort((a, b) => a[0].getTime() - b[0].getTime());
  }

  private neighbors(date: Date): { before: Point | null; after: Point | null } {
    let before: Point | null = null;
    let after: Point | null = null;
    for (const point of this.points) {
      if (point[0].getTime() <= date.getTime()) before = point;
      if (point[0].getTime() > date.getTime() && after === null) after = point;
    }
    return { before, after };
  }

  heightAt(date: Date): number | null {
    const { before, after } = this.neighbors(date);
    if (before && after) {
      const total = after[0].getTime() - before[0].getTime();
      const elapsed = date.getTime() - before[0].getTime();
      const fraction = total > 0 ? elapsed / total : 0;
      return before[1] + (after[1] - before[1]) * fraction;
    }
    return before?.[1] ?? after?.[1] ?? null;
  }

  currentLevel(date: Date): CurrentLevel | null {
    if (this.points.length === 0) return null;
    const height = this.heightAt(date);
    if (height === null) return null;

    const { before, after } = this.neighbors(date);
    if (before && after) {
      const trend: Trend = after[1] > before[1] ? 'rising' : after[1] < before[1] ? 'falling' : 'steady';
      return { height, trend };
    }
    return { height, trend: 'unknown' };
  }

  hourlySamples(hours: number[], date: Date): HourlySample[] {
    return hours.map((hour) => ({
      hour,
      height: this.heightAt(TideClock.londonDateAtHour(date, hour)),
    }));
  }

  samplesEvery(minutes: number, from: Date, to: Date): TimeSample[] {
    const result: TimeSample[] = [];
    for (let t = from.getTime(); t <= to.getTime(); t += minutes * 60_000) {
      const time = new Date(t);
      result.push({ time, height: this.heightAt(time) });
    }
    return result;
  }
}
