import type { TemperatureSeries } from '../TemperatureSeries';
import type { WindSeries } from '../WindSeries';
import { hourLabel } from './format';
import { type FeelsReading, feelsOver, type TempBand, tempBandFor } from './feels';
import { type RainBand, type RainClause, rainBandFor, rainPeakOver } from './rain';
import { bandFor, windOver } from './wind';
import { dayTense, remainingSlots, type Slot } from './window';
import type { DayInsightsInput } from './types';

export const DARK_MAJORITY_FRACTION = 0.5; // above this share of the hours left, the call shifts to keeping warm
// The clothing call is split into two time-of-day segments rather than one
// mean over the whole window — a summer morning and afternoon can straddle a
// temp band even when the whole-day mean doesn't. CORE is the middle of the
// day, REST is everything outside it (early morning and evening, both within
// the day window).
export const CLOTHING_CORE_START_HOUR = 8;
export const CLOTHING_CORE_END_HOUR = 17;

// Top and bottom are read off the feels-like band (see TempBand) — the same
// bands the temperature sentence already names, so "it feels mild" and
// "wear a jumper" can never disagree. Rain overrides the top, but which
// wet top depends on temperature, not rain intensity: the dry robe is for
// really cold wet days (cold/cool, same WET_OVERRIDE_TEMP_BANDS footwear
// already uses) regardless of how hard it's raining, while a coat covers
// every wet mild/warm/hot day — including heavy rain — since it isn't
// freezing enough to need the full robe.
const TOP_FOR_TEMP: Record<TempBand, string> = {
  cold: 'a jumper',
  cool: 'a jumper',
  mild: 'a jumper',
  warm: 'a t-shirt',
  hot: 'a t-shirt',
};
const WET_TOP = 'a dry robe';
const WET_LIGHT_TOP = 'a coat';

const BOTTOM_FOR_TEMP: Record<TempBand, string> = {
  cold: 'trousers',
  cool: 'shorts',
  mild: 'shorts',
  warm: 'shorts',
  hot: 'shorts',
};

// Footwear default by temperature: cold falls back to camper shoes, cool
// takes sandals with socks (warm enough for shorts, not warm enough for bare
// feet), mild or above takes bare sandals, no socks.
const FOOTWEAR_FOR_TEMP: Record<TempBand, string> = {
  cold: 'camper shoes',
  cool: 'sandals with socks',
  mild: 'sandals',
  warm: 'sandals',
  hot: 'sandals',
};
const WET_FOOTWEAR = 'walking boots';

// The temp bands where wet weather gets the full cold-weather treatment
// (walking boots for footwear; a dry robe for top, regardless of rain
// intensity — see TOP_FOR_TEMP) rather than the lighter mild/warm/hot picks.
// Footwear: rain overrides it only when it's cold/cool enough that the dry
// default (camper shoes, or cool's sandals-with-socks) isn't up to standing
// water — mild or above stays on bare sandals even when wet, since those are
// meant to get wet and dry fast, unlike walking boots and socks, which soak
// through and stay that way.
const WET_OVERRIDE_TEMP_BANDS = new Set<TempBand>(['cold', 'cool']);

interface ClothingPick {
  top: string;
  bottom: string;
  footwear: string;
  // Context not already covered elsewhere in the summary — the rain band
  // itself is already in the main clauses, so this only carries what it
  // doesn't: wet ground left over from earlier rain, or that it's dark.
  extra: string | null;
}

export interface ClothingAdvice {
  primary: ClothingPick;
  // The 08:00–16:00 core and the rest of the day (early morning/evening)
  // often call for the same outfit — the same "don't repeat a signal" rule
  // the rest of the readout follows (see buildReadout) applies here too, so
  // secondary is only set when the two segments actually differ.
  secondary: ClothingPick | null;
}

function equalPick(a: ClothingPick, b: ClothingPick): boolean {
  return a.top === b.top && a.bottom === b.bottom && a.footwear === b.footwear && a.extra === b.extra;
}

function coreClothingSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.hour >= CLOTHING_CORE_START_HOUR && s.hour <= CLOTHING_CORE_END_HOUR);
}

function restClothingSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.hour < CLOTHING_CORE_START_HOUR || s.hour > CLOTHING_CORE_END_HOUR);
}

// One segment's pick. `rainBand`/`groundWet` are read off the whole
// remaining day (see clothingAdvice) rather than this segment alone —
// decision 2026-09-01-clothing-advice-matches-actual-wardrobe already
// treats any rain still ahead as reason enough to dress for rain for the
// rest of the day, not just the hours it actually falls. Temperature band,
// dark share, and wind are read per segment, since those genuinely differ
// between the middle of the day and its edges.
function pickForSegment(
  segAhead: Slot[],
  rainBand: RainBand,
  groundWet: boolean,
  temp: TemperatureSeries | null,
  wind: WindSeries | null,
  lightAlreadyStated: boolean,
): ClothingPick | null {
  if (segAhead.length === 0) return null;

  const wet = rainBand !== 'dry';
  const feels = feelsOver(segAhead, temp);
  const tempBand = feels ? tempBandFor(feels.mean) : 'mild';
  const darkShare = segAhead.filter((s) => !s.isLight).length / segAhead.length;
  const mostlyDark = darkShare > DARK_MAJORITY_FRACTION;

  const top = !wet ? TOP_FOR_TEMP[tempBand] : WET_OVERRIDE_TEMP_BANDS.has(tempBand) ? WET_TOP : WET_LIGHT_TOP;
  const bottom = BOTTOM_FOR_TEMP[tempBand];
  const footwear =
    (wet || groundWet) && WET_OVERRIDE_TEMP_BANDS.has(tempBand) ? WET_FOOTWEAR : FOOTWEAR_FOR_TEMP[tempBand];

  // An umbrella only helps alongside the coat, not the dry robe (already
  // rainproof) — and only when it's calm enough to actually hold one up; a
  // breezy or windy segment turns it inside out.
  const windBand = windOver(segAhead, wind);
  const calm = windBand ? bandFor(windBand.mean) === 'calm' : false;

  const extraParts: string[] = [];
  if (groundWet && !wet) extraParts.push('still wet underfoot');
  if (top === WET_LIGHT_TOP && calm) extraParts.push('carry an umbrella');
  if (mostlyDark && !lightAlreadyStated) extraParts.push('after dark');

  return { top, bottom, footwear, extra: extraParts.length > 0 ? extraParts.join(', ') : null };
}

export function clothingAdvice(
  input: DayInsightsInput,
  slots: Slot[],
  rain: RainClause | null,
  feels: FeelsReading | null,
  lightAlreadyStated: boolean,
): ClothingAdvice | null {
  if (dayTense(input.reference) === 'past') return null;
  if (!rain && !feels) return null;

  const ahead = remainingSlots(input, slots);

  // The rain clause has the last word on whether it's wet: it's what the
  // sentence says, and it already discounts spells that are over. A spell
  // that started before now can have its wettest hour behind us, so the
  // band is floored at drizzle rather than allowed to read "dry" while the
  // sentence says it's raining.
  let rainBand: RainBand = 'dry';
  if (rain?.wet) {
    const byPeak = rainBandFor(rainPeakOver(ahead, input.precipitationSeries));
    rainBand = byPeak === 'dry' ? 'drizzle' : byPeak;
  }
  const groundWet = rain?.groundWet ?? false;

  const core = pickForSegment(
    coreClothingSlots(ahead),
    rainBand,
    groundWet,
    input.temperatureSeries,
    input.windSeries,
    lightAlreadyStated,
  );
  const rest = pickForSegment(
    restClothingSlots(ahead),
    rainBand,
    groundWet,
    input.temperatureSeries,
    input.windSeries,
    lightAlreadyStated,
  );

  if (core && rest)
    return equalPick(core, rest) ? { primary: core, secondary: null } : { primary: core, secondary: rest };
  const only = core ?? rest;
  return only ? { primary: only, secondary: null } : null;
}

function pickPhrase(pick: ClothingPick): string {
  return `${pick.top} and ${pick.bottom}, with ${pick.footwear}${pick.extra ? ` — ${pick.extra}` : ''}`;
}

export function clothingSentence(clothing: ClothingAdvice): string {
  if (!clothing.secondary) return `Wear ${pickPhrase(clothing.primary)}`;
  return `Between ${hourLabel(CLOTHING_CORE_START_HOUR)} and ${hourLabel(CLOTHING_CORE_END_HOUR)}, wear ${pickPhrase(
    clothing.primary,
  )}. Outside those hours, wear ${pickPhrase(clothing.secondary)}`;
}
