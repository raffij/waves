import { SUN_BAND_HAZY_WM2, SUN_BAND_SUNNY_WM2, WET_HOUR_MM } from './DayInsights';
import type { PrecipitationSeries } from './PrecipitationSeries';
import type { SunBrightnessSeries } from './SunBrightnessSeries';
import { TideClock } from './TideClock';

export type DayCondition = 'rain' | 'sunny' | 'hazy' | 'overcast';

// A single glyph-worthy condition for a whole day, for the forecast list's
// day tiles. Coarser than DayInsights' sentence, and — unlike it — never
// tense-aware: a day tile means "what this day looked like" regardless of
// when you're viewing it, so it always reads the day's full 24h data.
// Rain wins over sun (a rainy afternoon isn't a "sunny day" just because
// the morning was clear); reuses DayInsights' own thresholds so a day
// never reads "rain" in one place and "dry" in another.
export function dayCondition(
  dateKey: string,
  precipitationSeries: PrecipitationSeries | null,
  sunBrightnessSeries: SunBrightnessSeries | null,
): DayCondition {
  const date = TideClock.dateFromKey(dateKey);

  if (precipitationSeries && precipitationSeries.dailyTotal(date) > WET_HOUR_MM) return 'rain';

  const sunPeak = sunBrightnessSeries?.dailyPeak(date) ?? null;
  if (sunPeak === null) return 'overcast';
  if (sunPeak >= SUN_BAND_SUNNY_WM2) return 'sunny';
  if (sunPeak >= SUN_BAND_HAZY_WM2) return 'hazy';
  return 'overcast';
}
