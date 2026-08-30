import type { Extreme } from '../models/TideModels';
import { TideClock } from './TideClock';

export interface ForecastDay {
  label: string;
  dateKey: string;
  extremes: Extreme[];
}

// Groups extremes into labeled days ("Today", "Tomorrow", "Mon 17 Aug", ...).
export class TideForecast {
  constructor(private readonly extremes: Extreme[]) {}

  yesterday(from: Date): ForecastDay | null {
    const yesterdayDate = new Date(from.getTime() - 86_400_000);
    const yesterdayKey = TideClock.dateKey(yesterdayDate);
    const extremesForYesterday = this.extremes.filter((e) => e.localDate === yesterdayKey);
    if (extremesForYesterday.length === 0) return null;
    return {
      label: 'Yesterday',
      dateKey: yesterdayKey,
      extremes: extremesForYesterday,
    };
  }

  days(from: Date, limit: number): ForecastDay[] {
    const todayKey = TideClock.dateKey(from);
    const tomorrowKey = TideClock.dateKey(new Date(from.getTime() + 86_400_000));

    const seen: string[] = [];
    const byDate: Record<string, Extreme[]> = {};
    for (const extreme of this.extremes) {
      if (extreme.localDate < todayKey) continue;
      if (!seen.includes(extreme.localDate)) seen.push(extreme.localDate);
      byDate[extreme.localDate] ??= [];
      byDate[extreme.localDate].push(extreme);
    }

    return seen.slice(0, limit).map((dateKey) => ({
      label: this.labelFor(dateKey, todayKey, tomorrowKey),
      dateKey,
      extremes: byDate[dateKey] ?? [],
    }));
  }

  // The first high/low strictly after `from`. Extremes are already in
  // chronological order from the API, but sort defensively on the ISO
  // localTime rather than trust that.
  nextExtreme(from: Date): Extreme | null {
    return (
      this.extremes
        .filter((e) => {
          const t = TideClock.parseLondonWallTime(e.localTime);
          return t !== null && t.getTime() > from.getTime();
        })
        .sort((a, b) => a.localTime.localeCompare(b.localTime))[0] ?? null
    );
  }

  private labelFor(dateKey: string, todayKey: string, tomorrowKey: string): string {
    if (dateKey === todayKey) return 'Today';
    if (dateKey === tomorrowKey) return 'Tomorrow';
    const [year, month, day] = dateKey.split('-').map(Number);
    const noonUTC = new Date(Date.UTC(year, month - 1, day, 12)); // avoids DST edge cases
    return TideClock.format(noonUTC, { weekday: 'short', day: 'numeric', month: 'short' });
  }
}
