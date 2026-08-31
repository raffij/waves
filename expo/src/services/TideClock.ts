const LONDON_TZ = 'Europe/London';

type PartsMap = Record<string, string>;

function partsOf(date: Date): PartsMap {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const map: PartsMap = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

// Shared London-time date parsing/formatting, mirroring the macOS widget's TideClock.
export class TideClock {
  static readonly timeZone = LONDON_TZ;

  static parseISODate(value: string): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Parses "yyyy-MM-ddTHH:mm[:ss]" that carries NO timezone offset as
  // Europe/London wall-clock time, regardless of the host timezone — so
  // Open-Meteo's timezone=Europe/London strings land on the right instant
  // even for a viewer whose browser is on another zone. A string that
  // already has an offset or trailing "Z" is passed straight to
  // parseISODate.
  static parseLondonWallTime(value: string): Date | null {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return TideClock.parseISODate(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!m) return TideClock.parseISODate(value);
    const [, y, mo, d, h, mi, s] = m;
    const asUTC = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
    // Two-pass: offsetMillis needs an instant near the target day. The
    // first guess is off by at most the London offset; re-evaluating the
    // offset at that guess is exact except inside the ~1h DST transition.
    const offset = TideClock.offsetMillis(new Date(asUTC));
    return new Date(asUTC - offset);
  }

  static format(date: Date, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat('en-GB', { timeZone: LONDON_TZ, ...options }).format(date);
  }

  // yyyy-MM-dd for the given instant, evaluated in London local time
  static dateKey(date: Date): string {
    const p = partsOf(date);
    return `${p.year}-${p.month}-${p.day}`;
  }

  // Milliseconds to add to a UTC timestamp to get London wall-clock time (handles BST)
  private static offsetMillis(date: Date): number {
    const p = partsOf(date);
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUTC - date.getTime();
  }

  // A Date representing `hour`:00 London-local time on the same London calendar day as `base`
  static londonDateAtHour(base: Date, hour: number): Date {
    const p = partsOf(base);
    const offset = TideClock.offsetMillis(base);
    const utcGuess = Date.UTC(+p.year, +p.month - 1, +p.day, hour, 0, 0) - offset;
    return new Date(utcGuess);
  }

  // A Date at noon local time on the given yyyy-MM-dd key — a stable
  // instant to represent "this calendar day" without touching a DST edge.
  static dateFromKey(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  // `day`'s London calendar date, combined with `timeSource`'s London
  // hour:minute — e.g. "what time is it right now, on this other day".
  static withTimeOfDay(day: Date, timeSource: Date): Date {
    const dayParts = partsOf(day);
    const timeParts = partsOf(timeSource);
    const offset = TideClock.offsetMillis(day);
    const utcGuess =
      Date.UTC(+dayParts.year, +dayParts.month - 1, +dayParts.day, +timeParts.hour, +timeParts.minute, 0) - offset;
    return new Date(utcGuess);
  }
}
