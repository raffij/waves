import { HEAVY_PEAK_MM, SUN_BAND_HAZY_WM2, SUN_BAND_SUNNY_WM2, WET_HOUR_MM } from './DayInsights';
import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from './DayWindow';
import type { PrecipitationSeries } from './PrecipitationSeries';
import type { SunBrightnessSeries } from './SunBrightnessSeries';
import { TideClock } from './TideClock';

export type DayCondition = 'rain' | 'sunny' | 'hazy' | 'overcast';

// A day earns the rain icon for genuine coverage — a good chunk of its
// daylight hours actually wet — not for a single trace/drizzle hour that
// leaves the rest of the day untouched. A properly heavy hour (see
// HEAVY_PEAK_MM) still earns it on its own, coverage or not: a downpour is
// notable even if it's brief.
const RAIN_ICON_COVERAGE_FRACTION = 0.2;

// A single glyph-worthy condition for a whole day, for the forecast list's
// day tiles. Coarser than DayInsights' sentence, and — unlike it — never
// tense-aware: a day tile means "what this day looked like", so it always
// reads the day's own full data regardless of when you're viewing it.
//
// Weighs how much of the day was actually wet rather than defaulting to
// the rain icon for any measurable amount, so a day that was mostly sunny
// but had one light shower reads as sunny — the overall picture, not the
// single worst hour.
export function dayCondition(
  dateKey: string,
  precipitationSeries: PrecipitationSeries | null,
  sunBrightnessSeries: SunBrightnessSeries | null,
): DayCondition {
  const date = TideClock.dateFromKey(dateKey);

  if (precipitationSeries) {
    const windowStart = TideClock.londonDateAtHour(date, DAY_WINDOW_START_HOUR);
    const windowEnd = TideClock.londonDateAtHour(date, DAY_WINDOW_END_HOUR);
    const bars = precipitationSeries.hourlyBars(windowStart, windowEnd);
    const peakMm = bars.length > 0 ? Math.max(0, ...bars.map((b) => b.mm ?? 0)) : 0;
    const wetHours = bars.filter((b) => (b.mm ?? 0) > WET_HOUR_MM).length;
    const coverage = bars.length > 0 ? wetHours / bars.length : 0;
    if (peakMm >= HEAVY_PEAK_MM || coverage >= RAIN_ICON_COVERAGE_FRACTION) return 'rain';
  }

  const sunPeak = sunBrightnessSeries?.dailyPeak(date) ?? null;
  if (sunPeak === null) return 'overcast';
  if (sunPeak >= SUN_BAND_SUNNY_WM2) return 'sunny';
  if (sunPeak >= SUN_BAND_HAZY_WM2) return 'hazy';
  return 'overcast';
}
