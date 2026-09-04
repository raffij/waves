import { clothingAdvice } from './clothing';
import { feelsOver } from './feels';
import { lightClause } from './light';
import { rainClause } from './rain';
import { buildReadout } from './readout';
import { sunOver } from './sun';
import { windShape } from './wind';
import { dayTense, remainingSlots, windowSlots } from './window';
import type { DayInsightsInput, DayInsightsReadout } from './types';

// The day-insights readout: one flowing, wordy sentence covering the day's
// wind, rain, sun, feel and light, and what to wear. It's a walk-on-the-pier
// judgement — not a water-sports one; tide is reported elsewhere but never
// scored here.
//
// The logic is split one module per weather domain, each pairing an
// analyser (reads the series over a set of slots) with a phrase builder:
//
//   window    — the shared 06:00–20:00 slots, morning/afternoon split, and
//               past/today/future tense
//   wind, rain, sun, feels, light — one domain each; tuning knobs live at
//               the top of their own module
//   clothing  — the wardrobe call, downstream of feels/wind/rain
//   readout   — assembles the clause fragments into the paragraph
//
// The day is judged over the shared window (see DayWindow), the same span
// both charts plot, so the sentence, the clothing call and the bars can
// never disagree about whether it rains — except that on today, the
// sentence and clothing call both narrow that window to "now through the
// end", so they describe what's still ahead rather than restating hours
// that have already passed. A future or past day has no "now" to narrow
// from, so both read the window whole.

export type { DayInsightsInput, DayInsightsReadout } from './types';
// Re-exported for DayCondition.ts, which shares the sun banding and the
// rain thresholds rather than duplicating them.
export { sunBandFor, type SunBand } from './sun';
export { HEAVY_PEAK_MM, WET_HOUR_MM } from './rain';

export function buildDayInsights(input: DayInsightsInput): DayInsightsReadout {
  const slots = windowSlots(input);
  const tense = dayTense(input.reference);
  // The readout describes what's still ahead, not the whole day behind it:
  // on today it reads only the hours from now to the end of the window (the
  // same cutoff the clothing call and rain clause already use). A future day
  // has no "now" within it and a past day is already over, so both read the
  // window whole. Summary and progression therefore share one time scope.
  const summarySlots = tense === 'today' ? remainingSlots(input, slots) : slots;
  const shape = windShape(summarySlots, input.windSeries);
  const rain = rainClause(input, input.precipitationSeries);
  const sun = sunOver(summarySlots, input.sunBrightnessSeries, input.cloudCoverSeries);
  const feels = feelsOver(summarySlots, input.temperatureSeries);
  const light = lightClause(input);

  const clothing = clothingAdvice(input, slots, rain, feels, light !== null);

  return {
    summary: buildReadout(input, tense, summarySlots, shape, rain, sun, feels, light, clothing),
  };
}
