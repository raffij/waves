import type { TemperatureSeries } from '../TemperatureSeries';
import { average } from './format';
import { afternoonSlots, type DayTense, morningSlots, type Slot } from './window';

// "Feels like" comfort bands, °C, read off the mean over the window/segment
// — the word the sentence reaches for ("mild", "warm") alongside the actual
// figures, so the numbers land against a sense of what they mean rather than
// standing alone.
export const TEMP_BAND_COOL_C = 10;
export const TEMP_BAND_MILD_C = 14;
export const TEMP_BAND_WARM_C = 19;
export const TEMP_BAND_HOT_C = 24;
// A morning-to-afternoon swing in mean "feels like" temperature below this
// reads as noise — the readout says the day stays much the same rather than
// manufacturing a warming/cooling trend out of half a degree.
export const FEELS_TREND_THRESHOLD_C = 2;

export interface FeelsReading {
  mean: number;
  min: number;
  max: number;
}

export function feelsOver(slots: Slot[], temp: TemperatureSeries | null): FeelsReading | null {
  if (!temp) return null;
  const values = slots.map((s) => temp.feelsLikeAt(s.at)).filter((c): c is number => c !== null);
  if (values.length === 0) return null;
  return { mean: average(values), min: Math.min(...values), max: Math.max(...values) };
}

export type TempBand = 'cold' | 'cool' | 'mild' | 'warm' | 'hot';

export function tempBandFor(meanC: number): TempBand {
  if (meanC < TEMP_BAND_COOL_C) return 'cold';
  if (meanC < TEMP_BAND_MILD_C) return 'cool';
  if (meanC < TEMP_BAND_WARM_C) return 'mild';
  if (meanC < TEMP_BAND_HOT_C) return 'warm';
  return 'hot';
}

// Named alongside the figures ("it should feel mild, around 14–17°C") rather
// than left as bare numbers — the band is what answers "is that comfortable?",
// the range is the detail underneath it.
export function feelsPhrase(feels: FeelsReading, tense: DayTense): string {
  const lo = Math.round(feels.min);
  const hi = Math.round(feels.max);
  const verb = tense === 'past' ? 'it felt' : tense === 'future' ? 'it should feel' : 'it feels';
  const band = tempBandFor(feels.mean);
  const range = lo === hi ? `${lo}°C` : `${lo}–${hi}°C`;
  return `${verb} ${band}, around ${range}`;
}

// How "feels like" temperature shifts across the day — warming, cooling, or
// much the same throughout, keyed off the morning/afternoon mean so a single
// warm or cold hour can't swing the read.
export function feelsTrendClause(slots: Slot[], temp: TemperatureSeries | null, tense: DayTense): string | null {
  if (!temp) return null;
  const morning = morningSlots(slots)
    .map((s) => temp.feelsLikeAt(s.at))
    .filter((c): c is number => c !== null);
  const afternoon = afternoonSlots(slots)
    .map((s) => temp.feelsLikeAt(s.at))
    .filter((c): c is number => c !== null);
  if (morning.length === 0 || afternoon.length === 0) return null;

  const morningMean = average(morning);
  const afternoonMean = average(afternoon);
  const diff = afternoonMean - morningMean;
  if (diff >= FEELS_TREND_THRESHOLD_C) {
    const verb = tense === 'past' ? 'and warmed' : 'warming';
    const when = tense === 'today' ? 'this afternoon' : 'by afternoon';
    return `${verb} to ${Math.round(Math.max(...afternoon))}°C ${when}`;
  }
  if (diff <= -FEELS_TREND_THRESHOLD_C) {
    const verb = tense === 'past' ? 'and cooled' : 'cooling';
    return `${verb} to ${Math.round(Math.min(...afternoon))}°C into the evening`;
  }
  const period = tense === 'today' ? 'for the rest of the day' : 'through the day';
  return `with little change ${period}`;
}
