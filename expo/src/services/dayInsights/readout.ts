import type { ClothingAdvice } from './clothing';
import { clothingSentence } from './clothing';
import { capitalize } from './format';
import { type FeelsReading, feelsPhrase, feelsTrendClause } from './feels';
import { type RainClause, dryConditionsClause, rainSentence } from './rain';
import { type SunReading, sunTrendClause } from './sun';
import { type WindShape, windClause } from './wind';
import type { DayTense, Slot } from './window';
import type { DayInsightsInput } from './types';

// The readout is intentionally allowed to be wordy. It is one paragraph, but
// not one giant sentence: the first sentence gives the headline conditions,
// the next develops the light and temperature story, and the final sentence
// turns that into practical advice. Each signal is mentioned once, avoiding
// the old two-part repetition.
export function buildReadout(
  input: DayInsightsInput,
  tense: DayTense,
  summarySlots: Slot[],
  shape: WindShape | null,
  rain: RainClause | null,
  sun: SunReading | null,
  feels: FeelsReading | null,
  light: string | null,
  clothing: ClothingAdvice | null,
): string {
  const sentences: string[] = [];

  if (shape) {
    const wind = capitalize(windClause(shape, tense));
    sentences.push(rain && !rain.wet ? `${wind}, ${dryConditionsClause(tense)}.` : `${wind}.`);
  }
  if (rain && (!shape || rain.wet)) sentences.push(`${capitalize(rainSentence(rain, tense))}.`);

  const sunshine = sunTrendClause(summarySlots, input.sunBrightnessSeries, input.cloudCoverSeries, tense);
  const trend = feels ? feelsTrendClause(summarySlots, input.temperatureSeries, tense) : null;
  const temperature = feels ? `${feelsPhrase(feels, tense)}${trend ? `, ${trend}` : ''}` : null;

  if (sunshine) sentences.push(`${capitalize(sunshine)}.`);
  if (temperature) sentences.push(`${capitalize(temperature)}.`);

  if (light && (shape || rain || sun || feels)) sentences.push(`${capitalize(light)}.`);
  if (clothing) sentences.push(`${clothingSentence(clothing)}.`);

  return sentences.length > 0 ? sentences.join(' ') : 'Tide data only — wind and rain forecast unavailable.';
}
