// Generic linear-interpolation series + compass-direction helpers, used to
// turn TideCheck/Open-Meteo's hourly/15-min samples into a "value right
// now" reading. A standalone port of the ideas in
// expo/src/services/{TideSeries,WindSeries,WaveSeries,SeaTemperatureSeries}.ts,
// collapsed into one shared class here since this tool has exactly one
// consumer (itself) — unlike the app, which keeps one class per concern.

export class ValueSeries {
  // points: Array<{ time: Date, value: number | null }>
  constructor(points) {
    this.points = points
      .filter((p) => p.time instanceof Date && !Number.isNaN(p.time.getTime()))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  neighbors(date) {
    const ms = date.getTime();
    let before = null;
    let after = null;
    for (const p of this.points) {
      if (p.time.getTime() === ms) return { before: p, after: p };
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }
    return { before, after };
  }

  valueAt(date) {
    const { before, after } = this.neighbors(date);
    const beforeValue = before?.value ?? null;
    const afterValue = after?.value ?? null;
    if (before === after) return beforeValue;
    if (beforeValue === null || afterValue === null) return beforeValue ?? afterValue ?? null;

    const ratio = (date.getTime() - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return beforeValue + (afterValue - beforeValue) * ratio;
  }

  trend(date, steadyThreshold) {
    const now = this.valueAt(date);
    const past = this.valueAt(new Date(date.getTime() - 60 * 60 * 1000));
    if (now === null || past === null) return 'unknown';
    const diff = now - past;
    if (Math.abs(diff) < steadyThreshold) return 'steady';
    return diff > 0 ? 'rising' : 'falling';
  }

  pointsBetween(from, to) {
    return this.points.filter((p) => p.time >= from && p.time <= to && p.value !== null);
  }
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Meteorological convention: degrees the wind is blowing FROM, clockwise from true north.
export function compassPointFor(degrees) {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % COMPASS_POINTS.length];
}

// Shortest signed angular step from a to b, clockwise positive, in (-180, 180].
function angularDelta(a, b) {
  return ((b - a + 540) % 360) - 180;
}

// Direction series need the shorter-arc treatment (a plain linear blend of
// e.g. 350° and 10° would swing through 180° instead of the 0° they
// actually straddle either side of).
export class DirectionSeries {
  constructor(points) {
    this.points = points
      .filter((p) => p.time instanceof Date && !Number.isNaN(p.time.getTime()))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  directionAt(date) {
    const ms = date.getTime();
    let before = null;
    let after = null;
    for (const p of this.points) {
      if (p.time.getTime() === ms) return p.value;
      if (p.time.getTime() < ms) before = p;
      if (p.time.getTime() > ms && !after) {
        after = p;
        break;
      }
    }
    if (!before || !after || before.value === null || after.value === null) {
      return before?.value ?? after?.value ?? null;
    }
    const ratio = (ms - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    return (((before.value + angularDelta(before.value, after.value) * ratio) % 360) + 360) % 360;
  }
}
