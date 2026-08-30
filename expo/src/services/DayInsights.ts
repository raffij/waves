import type { DaylightSeries } from './DaylightSeries';
import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from './DayWindow';
import type { PrecipitationSeries } from './PrecipitationSeries';
import { TideClock } from './TideClock';
import type { WindSeries } from './WindSeries';

// Tuning knobs for the day-insights readout. It's a walk-on-the-pier
// judgement — wind band, rain spell, what to wear — not a water-sports
// one; tide is reported but never scored. Retune by editing these.
//
// The day is judged over the shared 06:00–20:00 window (see DayWindow),
// the same span both charts plot, so the sentence, the clothing call and
// the bars can never disagree about whether it rains.
export const WET_HOUR_MM = 0.2; // hourly precip total above this counts as a "wet hour"
// Rain intensity read off the wettest hour in the window: below DRIZZLE it's
// drizzle, below HEAVY it's showery, at/above HEAVY it's heavy rain.
export const DRIZZLE_PEAK_MM = 0.5;
export const HEAVY_PEAK_MM = 2;
export const WIND_BAND_BREEZY_MPH = 12; // sentence bands: <12 calm, 12–24 breezy, ≥24 windy
export const WIND_BAND_WINDY_MPH = 24;
export const FALLBACK_SUNRISE_HOUR = 7; // light bounds used only when sunrise/sunset is unavailable
export const FALLBACK_SUNSET_HOUR = 21;
export const RAIN_DOMINATES_FRACTION = 0.55; // a single spell covering this share of the window reads as "most of the day"
export const RAIN_LONG_SPELL_HOURS = 4; // at/above this, a spell gets a "through the morning/afternoon/middle" phrase
export const DARK_MAJORITY_FRACTION = 0.5; // above this share of the hours left, the call shifts to keeping warm

// What to wear, and the rain / wind / light reading behind it. The garment
// comes from the intensity of the rain still to come, the wind it arrives
// on, and whether the hours you'd be out in are dark — a 25mph downpour
// wants a dry robe, the same rain in still air wants an umbrella, and a
// dry, calm evening after sunset wants a warm layer more than either.
export interface ClothingAdvice {
  garment: string;
  reason: string;
}

export interface DayInsights {
  summarySentence: string;
  // What to wear for the part of the day that's left. Null for a day
  // that's already over.
  clothing: ClothingAdvice | null;
}

export interface DayInsightsInput {
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
  daylightSeries: DaylightSeries | null;
  reference: Date;
}

const HOUR_MS = 3_600_000;
const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

function hhmm(date: Date): string {
  return TideClock.format(date, HHMM);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// --- the day window ----------------------------------------------------------

interface Slot {
  hour: number;
  at: Date;
  isLight: boolean;
}

interface LightBounds {
  sunrise: Date;
  sunset: Date;
  // False when these are the fixed fallback hours rather than real
  // sunrise/sunset — the readout never quotes a made-up time.
  known: boolean;
}

function lightBounds(input: DayInsightsInput): LightBounds {
  const { reference, daylightSeries } = input;
  const sunrise = daylightSeries?.sunrise(reference) ?? null;
  const sunset = daylightSeries?.sunset(reference) ?? null;
  if (sunrise && sunset) return { sunrise, sunset, known: true };
  return {
    sunrise: TideClock.londonDateAtHour(reference, FALLBACK_SUNRISE_HOUR),
    sunset: TideClock.londonDateAtHour(reference, FALLBACK_SUNSET_HOUR),
    known: false,
  };
}

// On-the-hour slots across the shared day window, each flagged for whether
// it falls between sunrise and sunset.
function windowSlots(input: DayInsightsInput): Slot[] {
  const { sunrise, sunset } = lightBounds(input);
  const slots: Slot[] = [];
  for (let h = DAY_WINDOW_START_HOUR; h <= DAY_WINDOW_END_HOUR; h++) {
    const at = TideClock.londonDateAtHour(input.reference, h);
    slots.push({ hour: h, at, isLight: at.getTime() >= sunrise.getTime() && at.getTime() <= sunset.getTime() });
  }
  return slots;
}

type DayTense = 'past' | 'today' | 'future';

function dayTense(reference: Date): DayTense {
  const todayKey = TideClock.dateKey(new Date());
  const refKey = TideClock.dateKey(reference);
  if (refKey < todayKey) return 'past';
  if (refKey > todayKey) return 'future';
  return 'today';
}

// What's left of the window: on today, the hours not yet over; on any other
// day, all of it. The clothing call keys off these — advice for a day is
// advice for the part of it you can still walk out into.
function remainingSlots(input: DayInsightsInput, slots: Slot[]): Slot[] {
  if (dayTense(input.reference) !== 'today') return slots;
  const ahead = slots.filter((s) => s.at.getTime() + HOUR_MS > input.reference.getTime());
  return ahead.length > 0 ? ahead : slots.slice(-1);
}

// --- wind ------------------------------------------------------------------

type WindBand = 'calm' | 'breezy' | 'windy';

const BAND_WORD: Record<WindBand, string> = { calm: 'Calm', breezy: 'Breezy', windy: 'Windy' };
const BAND_RANK: Record<WindBand, number> = { calm: 0, breezy: 1, windy: 2 };

function bandFor(mph: number): WindBand {
  if (mph < WIND_BAND_BREEZY_MPH) return 'calm';
  if (mph < WIND_BAND_WINDY_MPH) return 'breezy';
  return 'windy';
}

interface WindReading {
  mean: number;
  peak: number;
}

function windOver(slots: Slot[], windSeries: WindSeries | null): WindReading | null {
  if (!windSeries) return null;
  const speeds = slots.map((s) => windSeries.speedAt(s.at)).filter((mph): mph is number => mph !== null);
  if (speeds.length === 0) return null;
  return { mean: speeds.reduce((a, b) => a + b, 0) / speeds.length, peak: Math.max(...speeds) };
}

// The band to dress for. A day that peaks in the windy band is a windy day
// even if it averages out breezy — that peak is when the umbrella turns
// inside out — but a single 12mph hour doesn't make a calm day breezy.
function bandToDressFor(wind: WindReading): WindBand {
  return bandFor(wind.peak) === 'windy' ? 'windy' : bandFor(wind.mean);
}

interface WindShape {
  morningBand: WindBand;
  afternoonBand: WindBand;
  afternoonPeak: number;
}

function windShape(slots: Slot[], windSeries: WindSeries | null): WindShape | null {
  const all = windOver(slots, windSeries);
  if (!all) return null;
  const morning = windOver(
    slots.filter((s) => s.hour <= 12),
    windSeries,
  );
  const afternoon = windOver(
    slots.filter((s) => s.hour >= 13),
    windSeries,
  );
  return {
    morningBand: bandFor((morning ?? all).mean),
    afternoonBand: bandFor((afternoon ?? all).mean),
    afternoonPeak: (afternoon ?? all).peak,
  };
}

function windClause(w: WindShape): string {
  if (w.morningBand === w.afternoonBand) return `${BAND_WORD[w.morningBand]} all day`;
  if (BAND_RANK[w.afternoonBand] > BAND_RANK[w.morningBand]) {
    return `${BAND_WORD[w.morningBand]} this morning, wind building to ~${Math.round(w.afternoonPeak)}mph by mid-afternoon`;
  }
  return `${BAND_WORD[w.morningBand]} this morning, easing through the afternoon`;
}

// --- rain ----------------------------------------------------------------

type RainBand = 'dry' | 'drizzle' | 'showery' | 'heavy';

function rainBandFor(peakMm: number): RainBand {
  if (peakMm <= WET_HOUR_MM) return 'dry';
  if (peakMm < DRIZZLE_PEAK_MM) return 'drizzle';
  if (peakMm < HEAVY_PEAK_MM) return 'showery';
  return 'heavy';
}

interface RainSpell {
  start: Date;
  end: Date; // last wet hour + 1h
  hours: number;
  peakMm: number;
}

// Contiguous runs of wet hours within the window.
function rainSpells(bars: Array<{ time: Date; mm: number | null }>): RainSpell[] {
  const spells: RainSpell[] = [];
  let run: Array<{ time: Date; mm: number }> = [];
  const flush = () => {
    if (run.length === 0) return;
    spells.push({
      start: run[0].time,
      end: new Date(run[run.length - 1].time.getTime() + HOUR_MS),
      hours: run.length,
      peakMm: Math.max(...run.map((r) => r.mm)),
    });
    run = [];
  };
  for (const b of bars) {
    if ((b.mm ?? 0) > WET_HOUR_MM) run.push({ time: b.time, mm: b.mm ?? 0 });
    else flush();
  }
  flush();
  return spells;
}

// Where in the day a spell sits, for spells long enough to be worth
// characterising — otherwise "" and the caller just states the times.
function rainCoverage(spell: RainSpell, totalBars: number, windowStart: Date, windowEnd: Date): string {
  if (totalBars > 0 && spell.hours / totalBars >= RAIN_DOMINATES_FRACTION) return 'for most of the day';
  if (spell.hours < RAIN_LONG_SPELL_HOURS) return '';
  const midday = windowStart.getTime() + (windowEnd.getTime() - windowStart.getTime()) / 2;
  const startsBeforeMidday = spell.start.getTime() < midday;
  const endsAfterMidday = spell.end.getTime() > midday;
  if (startsBeforeMidday && endsAfterMidday) return 'through the middle of the day';
  return endsAfterMidday ? 'through the afternoon' : 'through the morning';
}

// How the rain is named in the sentence, by how hard the wettest hour of
// the mentioned spells comes down.
const RAIN_NOUN: Record<RainBand, { single: string; repeated: string }> = {
  dry: { single: 'rain', repeated: 'showers' },
  drizzle: { single: 'drizzle', repeated: 'light showers' },
  showery: { single: 'rain', repeated: 'showers' },
  heavy: { single: 'heavy rain', repeated: 'heavy showers' },
};

// Lower-case fragment for the summary sentence, plus what the clothing call
// keys off (it never parses `text`):
//   wet       — rain is still to come or under way in the rest of the day
//   groundWet — today only: rain fell earlier but is done, so the pier
//               stays wet underfoot even though `wet` is false
interface RainClause {
  text: string;
  wet: boolean;
  groundWet: boolean;
}

function rainClause(input: DayInsightsInput, precip: PrecipitationSeries | null): RainClause | null {
  if (!precip) return null;

  const windowStart = TideClock.londonDateAtHour(input.reference, DAY_WINDOW_START_HOUR);
  const windowEnd = TideClock.londonDateAtHour(input.reference, DAY_WINDOW_END_HOUR);
  const bars = precip.hourlyBars(windowStart, windowEnd);
  const tense = dayTense(input.reference);

  // On today, spells that have already finished aren't worth mentioning in
  // the sentence — but they still leave the ground wet, so track that.
  const allSpells = rainSpells(bars);
  const spells = allSpells.filter((s) => tense !== 'today' || s.end.getTime() > input.reference.getTime());
  const groundWet = tense === 'today' && spells.length === 0 && allSpells.length > 0;

  if (spells.length === 0) {
    const text = tense === 'past' ? 'stayed dry' : tense === 'future' ? 'likely dry' : 'staying dry';
    return { text, wet: false, groundWet };
  }

  const noun = RAIN_NOUN[rainBandFor(Math.max(...spells.map((s) => s.peakMm)))];
  const midday = windowStart.getTime() + (windowEnd.getTime() - windowStart.getTime()) / 2;

  if (spells.length > 1) {
    const allBeforeMidday = spells.every((s) => s.end.getTime() <= midday);
    const allAfterMidday = spells.every((s) => s.start.getTime() >= midday);
    const when = allBeforeMidday ? ' in the morning' : allAfterMidday ? ' in the afternoon' : ' through the day';
    const lead =
      tense === 'future'
        ? `${noun.repeated} likely`
        : tense === 'past'
          ? `${noun.repeated} came and went`
          : `${noun.repeated} on and off`;
    return { text: `${lead}${when}`, wet: true, groundWet: false };
  }

  const s = spells[0];
  const range = `${hhmm(s.start)} to ${hhmm(s.end)}`;

  // Today, rain already under way — the start is behind us, so lead with the end.
  if (tense === 'today' && s.start.getTime() <= input.reference.getTime()) {
    return { text: `${noun.single} until ${hhmm(s.end)}`, wet: true, groundWet: false };
  }

  const coverage = rainCoverage(s, bars.length, windowStart, windowEnd);
  const likely = tense === 'future' ? 'likely ' : '';
  return {
    text: coverage ? `${noun.single} ${likely}${coverage}, ${range}` : `${noun.single} ${likely}from ${range}`,
    wet: true,
    groundWet: false,
  };
}

// --- light ------------------------------------------------------------------

// "dark by 16:21", for a day whose sunset lands inside the window and is
// still ahead. Omitted when the light holds to the end of the window, when
// it's already gone, and when sunrise/sunset never loaded.
function lightClause(input: DayInsightsInput): string | null {
  const { sunset, known } = lightBounds(input);
  if (!known || dayTense(input.reference) === 'past') return null;
  const windowEnd = TideClock.londonDateAtHour(input.reference, DAY_WINDOW_END_HOUR);
  if (sunset.getTime() >= windowEnd.getTime()) return null;
  if (dayTense(input.reference) === 'today' && sunset.getTime() <= input.reference.getTime()) return null;
  return `dark by ${hhmm(sunset)}`;
}

// --- clothing ---------------------------------------------------------------

// Rain band × wind band. Rain decides how waterproof, wind decides whether
// an umbrella is worth carrying at all.
const GARMENT: Record<RainBand, Record<WindBand, string>> = {
  dry: { calm: 'Light layers', breezy: 'Windbreaker', windy: 'Windproof jacket' },
  drizzle: { calm: 'Umbrella', breezy: 'Hooded jacket', windy: 'Waterproof shell' },
  showery: { calm: 'Umbrella', breezy: 'Rain jacket', windy: 'Waterproof shell' },
  heavy: { calm: 'Waterproofs', breezy: 'Waterproofs', windy: 'Dry robe' },
};

// Dry hours after sunset (or before sunrise) are about warmth, not shelter,
// so the dry row swaps for something that holds heat. A wet dark hour keeps
// its rain gear — that's still the binding problem — and the reason line
// says it's after dark.
const DARK_DRY_GARMENT: Record<WindBand, string> = {
  calm: 'Warm layer',
  breezy: 'Warm coat',
  windy: 'Windproof coat',
};

// Intensity only — whether it comes in bursts or sits there all afternoon
// is the sentence's job, so this never says "showers" and contradicts it.
const RAIN_PHRASE: Record<RainBand, string> = {
  dry: 'dry',
  drizzle: 'light drizzle',
  showery: 'rain',
  heavy: 'heavy rain',
};

function windPhrase(wind: WindReading): string {
  const band = bandToDressFor(wind);
  if (band === 'windy') return `${Math.round(wind.peak)}mph wind`;
  if (band === 'breezy') return `${Math.round(wind.mean)}mph breeze`;
  return 'light wind';
}

// The wettest hour still ahead, in mm. 0 when the forecast has nothing to
// say about those hours — which matches the rain clause, since it reads the
// same buckets.
function rainPeakOver(slots: Slot[], precip: PrecipitationSeries | null): number {
  if (!precip) return 0;
  const mms = slots.map((s) => precip.mmAt(s.at)).filter((mm): mm is number => mm !== null);
  return mms.length > 0 ? Math.max(...mms) : 0;
}

function clothingAdvice(
  input: DayInsightsInput,
  slots: Slot[],
  wind: WindReading | null,
  rain: RainClause | null,
): ClothingAdvice | null {
  if (dayTense(input.reference) === 'past') return null;
  if (!rain && !wind) return null;

  const ahead = remainingSlots(input, slots);
  const darkShare = ahead.filter((s) => !s.isLight).length / ahead.length;
  const mostlyDark = darkShare > DARK_MAJORITY_FRACTION;

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
  const windBand = wind ? bandToDressFor(wind) : 'calm';

  const garment = rainBand === 'dry' && mostlyDark ? DARK_DRY_GARMENT[windBand] : GARMENT[rainBand][windBand];

  const reasonParts: string[] = [];
  if (rain) reasonParts.push(RAIN_PHRASE[rainBand]);
  if (rain?.groundWet) reasonParts.push('still wet underfoot');
  if (wind) reasonParts.push(windPhrase(wind));
  // Only the signal that actually moved the garment. A sunset still to come
  // is in the sentence already; repeating it here would just pad the line.
  if (mostlyDark) reasonParts.push('after dark');

  return { garment, reason: reasonParts.join(', ') };
}

// --- entry point --------------------------------------------------------------

export function buildDayInsights(input: DayInsightsInput): DayInsights {
  const slots = windowSlots(input);
  const shape = windShape(slots, input.windSeries);
  const rain = rainClause(input, input.precipitationSeries);
  const aheadWind = windOver(remainingSlots(input, slots), input.windSeries);

  const clauses: string[] = [];
  if (shape) clauses.push(windClause(shape));
  if (rain) clauses.push(shape ? rain.text : capitalize(rain.text));
  const light = lightClause(input);
  if (light && clauses.length > 0) clauses.push(light);

  const summarySentence =
    clauses.length > 0 ? `${clauses.join(', ')}.` : 'Tide data only — wind and rain forecast unavailable.';

  return {
    summarySentence,
    clothing: clothingAdvice(input, slots, aheadWind, rain),
  };
}
