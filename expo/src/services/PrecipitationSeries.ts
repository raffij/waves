import type { PrecipitationData } from '../models/WeatherModels';
import { TideClock } from './TideClock';

// Precipitation is an hourly total (mm that fell during that hour), not a
// point-in-time reading, so — unlike tide/wave/wind — it's never
// interpolated between samples. Each hour's bucket is looked up directly.
export class PrecipitationSeries {
  private readonly points: Array<{ time: Date; mm: number | null }>;

  constructor(data: PrecipitationData) {
    this.points = data.time.map((timeStr, i) => ({
      time: TideClock.parseLondonWallTime(timeStr) ?? new Date(Number.NaN),
      mm: data.precipitation[i] ?? null,
    }));
  }

  mmAt(date: Date): number | null {
    const hourStart = new Date(date);
    hourStart.setMinutes(0, 0, 0);
    const match = this.points.find((p) => p.time.getTime() === hourStart.getTime());
    return match?.mm ?? null;
  }

  // One bucket per hour in [from, to], inclusive, for a bar chart.
  hourlyBars(from: Date, to: Date): Array<{ time: Date; mm: number | null }> {
    const bars: Array<{ time: Date; mm: number | null }> = [];
    let current = new Date(from);
    current.setMinutes(0, 0, 0);

    while (current.getTime() <= to.getTime()) {
      bars.push({ time: new Date(current), mm: this.mmAt(current) });
      current = new Date(current.getTime() + 60 * 60 * 1000);
    }

    return bars;
  }

  totalBetween(from: Date, to: Date): number {
    return this.hourlyBars(from, to).reduce((sum, b) => sum + (b.mm ?? 0), 0);
  }

  dailyTotal(date: Date): number {
    const dayStart = TideClock.londonDateAtHour(date, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1000);
    return this.totalBetween(dayStart, dayEnd);
  }

  // The next hour (from `from` onward, inclusive) with measurable rain —
  // searches the full series rather than any particular display window, so
  // it can point at tomorrow morning even while the rest of today is dry.
  nextRainAfter(from: Date): Date | null {
    const fromHour = new Date(from);
    fromHour.setMinutes(0, 0, 0);
    const match = this.points.find((p) => p.time.getTime() >= fromHour.getTime() && (p.mm ?? 0) > 0);
    return match?.time ?? null;
  }
}
