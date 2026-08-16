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

  private labelFor(dateKey: string, todayKey: string, tomorrowKey: string): string {
    if (dateKey === todayKey) return 'Today';
    if (dateKey === tomorrowKey) return 'Tomorrow';
    const [year, month, day] = dateKey.split('-').map(Number);
    const noonUTC = new Date(Date.UTC(year, month - 1, day, 12)); // avoids DST edge cases
    return TideClock.format(noonUTC, { weekday: 'short', day: 'numeric', month: 'short' });
  }
}
