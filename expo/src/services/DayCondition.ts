import type { CloudCoverSeries } from './CloudCoverSeries';
import { HEAVY_PEAK_MM, type SunBand, sunBandFor, WET_HOUR_MM } from './DayInsights';
import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from './DayWindow';
import type { PrecipitationSeries } from './PrecipitationSeries';
import type { SunBrightnessSeries } from './SunBrightnessSeries';
import { TideClock } from './TideClock';

export type DayCondition = 'rain' | 'sunny' | 'hazy' | 'overcast';

// The day-tile glyph set doesn't distinguish "strong" from an ordinary
// sunny spell — that nuance belongs to the worded sentence, not a single
// icon (see the file comment on dayCondition below).
const CONDITION_FROM_SUN_BAND: Record<SunBand, DayCondition> = {
  overcast: 'overcast',
  hazy: 'hazy',
  sunny: 'sunny',
  strong: 'sunny',
};

export interface DayConditionHours {
  startHour: number;
  endHour: number;
}

const DEFAULT_HOURS: DayConditionHours = { startHour: DAY_WINDOW_START_HOUR, endHour: DAY_WINDOW_END_HOUR };

// A day earns the rain icon for genuine coverage — a good chunk of the
// given hours actually wet — not for a single trace/drizzle hour that
// leaves the rest of the day untouched. A properly heavy hour (see
// HEAVY_PEAK_MM) still earns it on its own, coverage or not: a downpour is
// notable even if it's brief.
const RAIN_ICON_COVERAGE_FRACTION = 0.2;

// A single glyph-worthy condition for a whole day, for the forecast list's
// day tiles. Coarser than DayInsights' sentence, and — unlike it — never
// tense-aware: a day tile means "what this day looked like", so it always
// reads the day's own data regardless of when you're viewing it.
//
// `hours` scopes both readings to the same window the forecast list itself
// is showing (its daytime/whole-day toggle) — sun defaults to 0 overnight
// anyway, so it rarely changes that reading in practice, but rain coverage
// genuinely does: an overnight shower shouldn't earn the rain icon on a
// "daytime" reading, only on "whole day".
//
// Weighs how much of the window was actually wet rather than defaulting to
// the rain icon for any measurable amount, so a day that was mostly sunny
// but had one light shower reads as sunny — the overall picture, not the
// single worst hour.
export function dayCondition(
  dateKey: string,
  precipitationSeries: PrecipitationSeries | null,
  sunBrightnessSeries: SunBrightnessSeries | null,
  cloudCoverSeries: CloudCoverSeries | null,
  hours: DayConditionHours = DEFAULT_HOURS,
): DayCondition {
  const date = TideClock.dateFromKey(dateKey);
  const windowStart = TideClock.londonDateAtHour(date, hours.startHour);
  const windowEnd = TideClock.londonDateAtHour(date, hours.endHour);

  if (precipitationSeries) {
    const bars = precipitationSeries.hourlyBars(windowStart, windowEnd);
    const peakMm = bars.length > 0 ? Math.max(0, ...bars.map((b) => b.mm ?? 0)) : 0;
    const wetHours = bars.filter((b) => (b.mm ?? 0) > WET_HOUR_MM).length;
    const coverage = bars.length > 0 ? wetHours / bars.length : 0;
    if (peakMm >= HEAVY_PEAK_MM || coverage >= RAIN_ICON_COVERAGE_FRACTION) return 'rain';
  }

  let sunPeak: number | null = null;
  if (sunBrightnessSeries) {
    for (let h = hours.startHour; h <= hours.endHour; h++) {
      const v = sunBrightnessSeries.brightnessAt(TideClock.londonDateAtHour(date, h));
      if (v !== null) sunPeak = sunPeak === null ? v : Math.max(sunPeak, v);
    }
  }

  let minCloudPct: number | null = null;
  if (cloudCoverSeries) {
    for (let h = hours.startHour; h <= hours.endHour; h++) {
      const v = cloudCoverSeries.coverageAt(TideClock.londonDateAtHour(date, h));
      if (v !== null) minCloudPct = minCloudPct === null ? v : Math.min(minCloudPct, v);
    }
  }

  return CONDITION_FROM_SUN_BAND[sunBandFor(sunPeak, minCloudPct)];
}
