import type { WindData } from '../models/WeatherModels';
import { TideClock } from './TideClock';
import type { Trend } from './TideSeries';

// Below this, an hour-over-hour change reads as noise rather than a
// genuine rise or fall in wind speed.
const STEADY_THRESHOLD_MPH = 0.7;

// The 8 points a direction reading is named against in the UI and in
// day-insights prose — finer than this (16-point) reads as false precision
// for a forecast value that already wanders a few degrees hour to hour.
export type CompassPoint = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
const COMPASS_POINTS: readonly CompassPoint[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Meteorological convention: degrees the wind is blowing FROM, clockwise
// from true north (0/360 = north, 90 = east).
export function compassPointFor(degrees: number): CompassPoint {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % COMPASS_POINTS.length];
}

// Shortest signed angular step from `a` to `b`, clockwise positive, in
// (-180, 180] — the building block for both interpolating a direction
// between two hourly readings and comparing two period means, so 350° to
// 10° reads as "+20" rather than "-340".
export function angularDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

// The mean of a set of compass directions, taken as unit vectors rather
// than as plain numbers — averaging the raw degrees would pull a 350°/10°
// pair toward 180° (due south) instead of the 0° they actually sit either
// side of.
export function circularMean(degrees: number[]): number {
  const radians = degrees.map((d) => (d * Math.PI) / 180);
  const x = average(radians.map(Math.cos));
  const y = average(radians.map(Math.sin));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export class WindSeries {
  private readonly points: Array<{ time: Date; speed: number | null; direction: number | null; gust: number | null }>;

  constructor(data: WindData) {
    this.points = data.time.map((t, i) => ({
      time: TideClock.parseLondonWallTime(t) ?? new Date(Number.NaN),
      speed: data.wind_speed[i] ?? null,
      direction: data.wind_direction?.[i] ?? null,
      gust: data.wind_gusts?.[i] ?? null,
    }));
  }

  // Shared by speedAt/gustAt — both are plain linear-interpolated
  // quantities, unlike directionAt (below), which needs the shorter-arc
  // circular treatment instead.
  private interpolateLinear(date: Date, pick: (p: (typeof this.points)[0]) => number | null): number | null {
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

  speedAt(date: Date): number | null {
    return this.interpolateLinear(date, (p) => p.speed);
  }

  // Peak gust speed, mph — null wherever the forecast doesn't carry a gust
  // reading (older cached data, or the field temporarily missing from the
  // response), same fallback WindSeries already applies to direction.
  gustAt(date: Date): number | null {
    return this.interpolateLinear(date, (p) => p.gust);
  }

  // Degrees the wind is blowing from, meteorological convention (see
  // WindData). Interpolated along the shorter way round the compass — a
  // plain linear blend of e.g. 350° and 10° would swing through 180° (due
  // south) instead of passing through the 0° they actually straddle.
  directionAt(date: Date): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.direction;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    if (!before || !after || before.direction === null || after.direction === null) {
      return before?.direction ?? after?.direction ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return (((before.direction + angularDelta(before.direction, after.direction) * ratio) % 360) + 360) % 360;
  }

  samplesEvery(
    minutes: number,
    from: Date,
    to: Date,
  ): Array<{ time: Date; speed: number | null; gust: number | null }> {
    const samples: Array<{ time: Date; speed: number | null; gust: number | null }> = [];
    let current = from.getTime();
    const interval = minutes * 60 * 1000;

    while (current <= to.getTime()) {
      const time = new Date(current);
      samples.push({ time, speed: this.speedAt(time), gust: this.gustAt(time) });
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
