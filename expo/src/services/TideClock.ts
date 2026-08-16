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
// biome-ignore lint/complexity/noStaticOnlyClass: deliberate namespace-style class, matching the Swift TideClock this mirrors
export class TideClock {
  static readonly timeZone = LONDON_TZ;

  static parseISODate(value: string): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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
}
