import type { SeaCurrentData } from '../models/WeatherModels';
import { TideClock } from './TideClock';

const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

// 16-point compass label for a bearing in degrees (0 = N, 90 = E, ...).
export function compassPoint(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index];
}

// Ocean current at the sea surface: which way it's flowing (°, toward —
// see SeaCurrentData) and how fast (km/h).
export class SeaCurrentSeries {
  private readonly points: Array<{ time: Date; direction: number | null; velocity: number | null }>;

  constructor(data: SeaCurrentData) {
    this.points = data.time.map((timeStr, i) => ({
      time: TideClock.parseLondonWallTime(timeStr) ?? new Date(Number.NaN),
      direction: data.ocean_current_direction[i] ?? null,
      velocity: data.ocean_current_velocity[i] ?? null,
    }));
  }

  // Nearest-sample rather than interpolated — a direction is a compass
  // bearing, not a magnitude, so averaging two bearings across the 0/360
  // wrap (e.g. 350° and 10°) would produce a meaningless midpoint.
  directionAt(date: Date): number | null {
    const ms = date.getTime();
    let nearest: (typeof this.points)[0] | null = null;
    let nearestDelta = Number.POSITIVE_INFINITY;

    for (const p of this.points) {
      if (p.direction === null) continue;
      const delta = Math.abs(p.time.getTime() - ms);
      if (delta < nearestDelta) {
        nearest = p;
        nearestDelta = delta;
      }
    }

    return nearest?.direction ?? null;
  }

  velocityAt(date: Date): number | null {
    const ms = date.getTime();
    let before: (typeof this.points)[0] | null = null;
    let after: (typeof this.points)[0] | null = null;

    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.velocity;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }

    if (!before || !after || before.velocity === null || after.velocity === null) {
      return before?.velocity ?? after?.velocity ?? null;
    }

    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return before.velocity + (after.velocity - before.velocity) * ratio;
  }
}
