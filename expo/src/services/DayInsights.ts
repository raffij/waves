import type { CloudCoverSeries } from './CloudCoverSeries';
import type { DaylightSeries } from './DaylightSeries';
import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from './DayWindow';
import type { PrecipitationSeries } from './PrecipitationSeries';
import type { SunBrightnessSeries } from './SunBrightnessSeries';
import type { TemperatureSeries } from './TemperatureSeries';
import { TideClock } from './TideClock';
import type { WindSeries } from './WindSeries';

// Tuning knobs for the day-insights readout. It's a walk-on-the-pier
// judgement — wind band, rain spell, what to wear — not a water-sports
// one; tide is reported but never scored. Retune by editing these.
//
// The day is judged over the shared 06:00–20:00 window (see DayWindow), the
// same span both charts plot, so the sentence, the clothing call and the
// bars can never disagree about whether it rains — except that on today,
// the sentence and clothing call both narrow that window to "now through
// the end", so they describe what's still ahead rather than restating
// hours that have already passed. A future or past day has no "now" to
// narrow from, so both read the window whole.
export const WET_HOUR_MM = 0.2; // hourly precip total above this counts as a "wet hour"
// Rain intensity read off the wettest hour in the window: below DRIZZLE it's
// drizzle, below HEAVY it's showery, at/above HEAVY it's heavy rain.
export const DRIZZLE_PEAK_MM = 0.5;
export const HEAVY_PEAK_MM = 2;
export const WIND_BAND_BREEZY_MPH = 12; // sentence bands: <12 calm, 12–24 breezy, ≥24 windy
export const WIND_BAND_WINDY_MPH = 24;
// Sun bands read off the brightest hour in the window/segment, W/m² (already
// discounted for cloud cover) — below HAZY it's overcast, below SUNNY it's
// hazy/broken cloud, at/above SUNNY it's genuinely bright. Read alongside
// cloud cover (below), since brightness alone conflates "cloudy" with
// "winter sun sits low in the sky" — a thin, bright overcast can still cross
// SUNNY, and a clear pre-dawn/post-dusk hour reads as dark rather than
// overcast.
export const SUN_BAND_HAZY_WM2 = 120;
export const SUN_BAND_SUNNY_WM2 = 350;
// Cloud cover (%) at the clearest hour in the window/segment. Whichever of
// cloud cover and brightness reads cloudier wins the final band — see
// sunBandFor.
export const CLOUD_BAND_CLEAR_PCT = 25; // below this it's clear/sunny
export const CLOUD_BAND_OVERCAST_PCT = 75; // at/above this it's overcast regardless of brightness
// "Feels like" comfort bands, °C, read off the mean over the window/segment
// — the word the sentence reaches for ("mild", "warm") alongside the actual
// figures, so the numbers land against a sense of what they mean rather than
// standing alone.
export const TEMP_BAND_COOL_C = 10;
export const TEMP_BAND_MILD_C = 14;
export const TEMP_BAND_WARM_C = 19;
export const TEMP_BAND_HOT_C = 24;
// A morning-to-afternoon swing in mean "feels like" temperature below this
// reads as noise — the outlook says the day stays much the same rather than
// manufacturing a warming/cooling trend out of half a degree.
export const FEELS_TREND_THRESHOLD_C = 2;
export const FALLBACK_SUNRISE_HOUR = 7; // light bounds used only when sunrise/sunset is unavailable
export const FALLBACK_SUNSET_HOUR = 21;
export const RAIN_DOMINATES_FRACTION = 0.55; // a single spell covering this share of the window reads as "most of the day"
export const RAIN_LONG_SPELL_HOURS = 4; // at/above this, a spell gets a "through the morning/afternoon/middle" phrase
export const DARK_MAJORITY_FRACTION = 0.5; // above this share of the hours left, the call shifts to keeping warm

export interface DayInsights {
  // The day's conditions — wind, rain, sun, feel, light — and what to wear,
  // as one flowing description rather than a separate readout per signal.
  summary: string;
  // How rain, sun and "feels like" temperature change over the course of
  // the day. Null once there's nothing left to look forward to (a day
  // that's already over) or too little data to say anything.
  outlook: string | null;
}

export interface DayInsightsInput {
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
  daylightSeries: DaylightSeries | null;
  temperatureSeries: TemperatureSeries | null;
  sunBrightnessSeries: SunBrightnessSeries | null;
  cloudCoverSeries: CloudCoverSeries | null;
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

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
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

// The morning/afternoon split every trend reading (wind shape, rain/sun/feel
// outlook) uses, so they can never disagree about where "afternoon" starts.
function morningSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.hour <= 12);
}

function afternoonSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.hour >= 13);
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
  return { mean: average(speeds), peak: Math.max(...speeds) };
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
  const morning = windOver(morningSlots(slots), windSeries);
  const afternoon = windOver(afternoonSlots(slots), windSeries);
  return {
    morningBand: bandFor((morning ?? all).mean),
    afternoonBand: bandFor((afternoon ?? all).mean),
    afternoonPeak: (afternoon ?? all).peak,
  };
}

// "this morning" only reads right for today, where it genuinely is this
// morning — a past or future day gets the tense-neutral "in the morning"
// instead, same slot in the sentence.
const MORNING_PHRASE: Record<DayTense, string> = {
  past: 'in the morning',
  today: 'this morning',
  future: 'in the morning',
};

function windClause(w: WindShape, tense: DayTense): string {
  const morning = MORNING_PHRASE[tense];
  if (w.morningBand === w.afternoonBand) return `${BAND_WORD[w.morningBand]} all day`;
  if (BAND_RANK[w.afternoonBand] > BAND_RANK[w.morningBand]) {
    const build = tense === 'past' ? 'built' : tense === 'future' ? 'will build' : 'building';
    return `${BAND_WORD[w.morningBand]} ${morning}, wind ${build} to ~${Math.round(w.afternoonPeak)}mph by mid-afternoon`;
  }
  const ease = tense === 'past' ? 'eased' : tense === 'future' ? 'will ease' : 'easing';
  return `${BAND_WORD[w.morningBand]} ${morning}, ${ease} through the afternoon`;
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

// Intensity only, used both for the clothing call and the rain outlook.
const RAIN_PHRASE: Record<RainBand, string> = {
  dry: 'dry',
  drizzle: 'light drizzle',
  showery: 'rain',
  heavy: 'heavy rain',
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

// The wettest hour over a set of slots, in mm. 0 when the forecast has
// nothing to say about those hours.
function rainPeakOver(slots: Slot[], precip: PrecipitationSeries | null): number {
  if (!precip) return 0;
  const mms = slots.map((s) => precip.mmAt(s.at)).filter((mm): mm is number => mm !== null);
  return mms.length > 0 ? Math.max(...mms) : 0;
}

// How the rain itself changes shape across the day — dry throughout, a
// morning spell that clears, an afternoon spell moving in, or on-and-off all
// day. Independent of `rainClause`: that one reports what's still ahead (or
// already happened) for the sentence; this always reads the whole window,
// since the outlook is about the day's shape, not just what's left of it.
function rainTrendClause(slots: Slot[], precip: PrecipitationSeries | null, tense: DayTense): string | null {
  if (!precip) return null;

  const morningBand = rainBandFor(rainPeakOver(morningSlots(slots), precip));
  const afternoonBand = rainBandFor(rainPeakOver(afternoonSlots(slots), precip));

  if (morningBand === 'dry' && afternoonBand === 'dry') return tense === 'past' ? 'stayed dry all day' : 'dry all day';
  if (morningBand !== 'dry' && afternoonBand === 'dry') {
    return tense === 'past'
      ? `${RAIN_PHRASE[morningBand]} cleared by afternoon`
      : `${RAIN_PHRASE[morningBand]} clearing by afternoon`;
  }
  if (morningBand === 'dry' && afternoonBand !== 'dry') {
    return tense === 'past'
      ? `turned to ${RAIN_PHRASE[afternoonBand]} by afternoon`
      : `${RAIN_PHRASE[afternoonBand]} moving in by afternoon`;
  }
  return `${RAIN_PHRASE[afternoonBand]} on and off through the day`;
}

// --- sun ---------------------------------------------------------------------

export type SunBand = 'overcast' | 'hazy' | 'sunny';
const SUN_BAND_RANK: Record<SunBand, number> = { overcast: 0, hazy: 1, sunny: 2 };
// Same band word, tensed for the summary's main clause list — "was" for a
// day that's over, "likely" for one that hasn't happened yet, and today's
// bare noun phrase (a live read needs no tense marker of its own).
const SUN_WORD: Record<DayTense, Record<SunBand, string>> = {
  past: { overcast: 'stayed overcast', hazy: 'had hazy sun', sunny: 'had sunny spells' },
  today: { overcast: 'overcast', hazy: 'hazy sun', sunny: 'sunny spells' },
  future: { overcast: 'likely overcast', hazy: 'hazy sun likely', sunny: 'sunny spells likely' },
};
const SUN_ALL_DAY_PHRASE: Record<SunBand, string> = {
  overcast: 'overcast all day',
  hazy: 'hazy sun most of the day',
  sunny: 'sunny spells through the day',
};

// Brightness and cloud cover each vote for a band; whichever reads cloudier
// wins. That resolves both ways a single signal misleads on its own: a
// bright reading under a fully overcast sky is diffuse light through cloud,
// not real sun (brightness alone says sunny, cloud cover corrects it to
// overcast) — and a low cloud-cover reading before sunrise/after sunset is
// just dark, not sunny (cloud cover alone says sunny, brightness corrects it
// to overcast). Either signal missing, the other decides alone.
export function sunBandFor(peakWm2: number | null, minCloudPct: number | null): SunBand {
  const brightBand: SunBand | null =
    peakWm2 === null
      ? null
      : peakWm2 < SUN_BAND_HAZY_WM2
        ? 'overcast'
        : peakWm2 < SUN_BAND_SUNNY_WM2
          ? 'hazy'
          : 'sunny';
  const cloudBand: SunBand | null =
    minCloudPct === null
      ? null
      : minCloudPct >= CLOUD_BAND_OVERCAST_PCT
        ? 'overcast'
        : minCloudPct < CLOUD_BAND_CLEAR_PCT
          ? 'sunny'
          : 'hazy';
  if (brightBand === null) return cloudBand ?? 'overcast';
  if (cloudBand === null) return brightBand;
  return SUN_BAND_RANK[cloudBand] < SUN_BAND_RANK[brightBand] ? cloudBand : brightBand;
}

interface SunReading {
  peak: number;
  minCloudPct: number | null;
}

function sunOver(slots: Slot[], sun: SunBrightnessSeries | null, cloud: CloudCoverSeries | null): SunReading | null {
  if (!sun) return null;
  const values = slots.map((s) => sun.brightnessAt(s.at)).filter((wm2): wm2 is number => wm2 !== null);
  if (values.length === 0) return null;
  const cloudValues = cloud
    ? slots.map((s) => cloud.coverageAt(s.at)).filter((pct): pct is number => pct !== null)
    : [];
  return { peak: Math.max(...values), minCloudPct: cloudValues.length > 0 ? Math.min(...cloudValues) : null };
}

// How strong the sun gets, morning vs. afternoon — brightening, clouding
// over, or one band held all day.
function sunTrendClause(slots: Slot[], sun: SunBrightnessSeries | null, cloud: CloudCoverSeries | null): string | null {
  const morning = sunOver(morningSlots(slots), sun, cloud);
  const afternoon = sunOver(afternoonSlots(slots), sun, cloud);
  if (!morning && !afternoon) return null;

  const morningReading = morning ?? afternoon ?? { peak: 0, minCloudPct: null };
  const afternoonReading = afternoon ?? morning ?? { peak: 0, minCloudPct: null };
  const morningBand = sunBandFor(morningReading.peak, morningReading.minCloudPct);
  const afternoonBand = sunBandFor(afternoonReading.peak, afternoonReading.minCloudPct);
  if (morningBand === afternoonBand) return SUN_ALL_DAY_PHRASE[morningBand];
  return SUN_BAND_RANK[afternoonBand] > SUN_BAND_RANK[morningBand]
    ? 'sunshine breaking through by afternoon'
    : 'clouding over by afternoon';
}

// --- feels-like temperature ----------------------------------------------

interface FeelsReading {
  mean: number;
  min: number;
  max: number;
}

function feelsOver(slots: Slot[], temp: TemperatureSeries | null): FeelsReading | null {
  if (!temp) return null;
  const values = slots.map((s) => temp.feelsLikeAt(s.at)).filter((c): c is number => c !== null);
  if (values.length === 0) return null;
  return { mean: average(values), min: Math.min(...values), max: Math.max(...values) };
}

type TempBand = 'cold' | 'cool' | 'mild' | 'warm' | 'hot';

function tempBandFor(meanC: number): TempBand {
  if (meanC < TEMP_BAND_COOL_C) return 'cold';
  if (meanC < TEMP_BAND_MILD_C) return 'cool';
  if (meanC < TEMP_BAND_WARM_C) return 'mild';
  if (meanC < TEMP_BAND_HOT_C) return 'warm';
  return 'hot';
}

// Named alongside the figures ("feels mild, 14–17°") rather than left as
// bare numbers — the band is what answers "is that comfortable?", the range
// is the detail underneath it.
function feelsPhrase(feels: FeelsReading, tense: DayTense): string {
  const lo = Math.round(feels.min);
  const hi = Math.round(feels.max);
  const verb = tense === 'past' ? 'felt' : tense === 'future' ? 'will feel' : 'feels';
  const band = tempBandFor(feels.mean);
  const range = lo === hi ? `${lo}°` : `${lo}–${hi}°`;
  return `${verb} ${band}, ${range}`;
}

// How "feels like" temperature shifts across the day — warming, cooling, or
// much the same throughout, keyed off the morning/afternoon mean so a single
// warm or cold hour can't swing the read.
function feelsTrendClause(slots: Slot[], temp: TemperatureSeries | null): string | null {
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
  if (diff >= FEELS_TREND_THRESHOLD_C) return `warming to ${Math.round(Math.max(...afternoon))}° by afternoon`;
  if (diff <= -FEELS_TREND_THRESHOLD_C) return `cooling to ${Math.round(Math.min(...afternoon))}° into the evening`;
  return `feeling much the same all day, around ${Math.round((morningMean + afternoonMean) / 2)}°`;
}

// --- light ------------------------------------------------------------------

// "dark by 16:21", for a day whose sunset lands inside the window and is
// still ahead. Omitted entirely for a day that's already over (there's
// nothing left to warn about), when the light holds to the end of the
// window, when today's sunset has already passed, and when sunrise/sunset
// never loaded.
function lightClause(input: DayInsightsInput): string | null {
  const { sunset, known } = lightBounds(input);
  const tense = dayTense(input.reference);
  if (!known || tense === 'past') return null;
  const windowEnd = TideClock.londonDateAtHour(input.reference, DAY_WINDOW_END_HOUR);
  if (sunset.getTime() >= windowEnd.getTime()) return null;
  if (tense === 'today' && sunset.getTime() <= input.reference.getTime()) return null;
  return tense === 'future' ? `will be dark by ${hhmm(sunset)}` : `dark by ${hhmm(sunset)}`;
}

// --- clothing ---------------------------------------------------------------

// Rain band × wind band, as the lower-case noun phrase (with article) folded
// straight into "Wear ___." — a 25mph downpour wants a dry robe, the same
// rain in still air wants an umbrella.
const GARMENT: Record<RainBand, Record<WindBand, string>> = {
  dry: { calm: 'light layers', breezy: 'a windbreaker', windy: 'a windproof jacket' },
  drizzle: { calm: 'an umbrella', breezy: 'a hooded jacket', windy: 'a waterproof shell' },
  showery: { calm: 'an umbrella', breezy: 'a rain jacket', windy: 'a waterproof shell' },
  heavy: { calm: 'waterproofs', breezy: 'waterproofs', windy: 'a dry robe' },
};

// Dry hours after sunset (or before sunrise) are about warmth, not shelter,
// so the dry row swaps for something that holds heat. A wet dark hour keeps
// its rain gear — that's still the binding problem.
const DARK_DRY_GARMENT: Record<WindBand, string> = {
  calm: 'a warm layer',
  breezy: 'a warm coat',
  windy: 'a windproof coat',
};

interface ClothingAdvice {
  garment: string;
  // Context not already covered elsewhere in the summary — the rain/wind
  // bands themselves are already in the main clauses, so this only carries
  // what they don't: wet ground left over from earlier rain, or a garment
  // that's really about it being dark rather than the stated conditions.
  extra: string | null;
}

function clothingAdvice(
  input: DayInsightsInput,
  slots: Slot[],
  wind: WindReading | null,
  rain: RainClause | null,
  lightAlreadyStated: boolean,
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

  const extraParts: string[] = [];
  if (rain?.groundWet) extraParts.push('still wet underfoot');
  if (mostlyDark && !lightAlreadyStated) extraParts.push('after dark');

  return { garment, extra: extraParts.length > 0 ? extraParts.join(', ') : null };
}

// --- outlook: how rain, sun and feel change through the day ------------------

function buildOutlook(input: DayInsightsInput, slots: Slot[], tense: DayTense): string | null {
  if (tense === 'past') return null;

  const clauses = [
    rainTrendClause(slots, input.precipitationSeries, tense),
    sunTrendClause(slots, input.sunBrightnessSeries, input.cloudCoverSeries),
    feelsTrendClause(slots, input.temperatureSeries),
  ].filter((c): c is string => c !== null);

  return clauses.length > 0 ? `${capitalize(clauses.join(', '))}.` : null;
}

// --- entry point --------------------------------------------------------------

export function buildDayInsights(input: DayInsightsInput): DayInsights {
  const slots = windowSlots(input);
  const tense = dayTense(input.reference);
  // The headline sentence describes what's still ahead, not the whole day
  // behind it too: on today it reads only the hours from now to the end of
  // the window (the same cutoff the clothing call and rain clause already
  // use). A future day has no "now" within it to cut off from, and a past
  // day is already over, so both are read whole. `outlook` stays on the
  // full window regardless (see its own comment) — it's about the day's
  // shape, not just the remainder of it.
  const summarySlots = tense === 'today' ? remainingSlots(input, slots) : slots;
  const shape = windShape(summarySlots, input.windSeries);
  const rain = rainClause(input, input.precipitationSeries);
  const sun = sunOver(summarySlots, input.sunBrightnessSeries, input.cloudCoverSeries);
  const feels = feelsOver(summarySlots, input.temperatureSeries);
  const light = lightClause(input);
  const aheadWind = windOver(summarySlots, input.windSeries);

  const clauses: string[] = [];
  if (shape) clauses.push(windClause(shape, tense));
  if (rain) clauses.push(shape ? rain.text : capitalize(rain.text));
  if (sun) clauses.push(SUN_WORD[tense][sunBandFor(sun.peak, sun.minCloudPct)]);
  if (feels) clauses.push(feelsPhrase(feels, tense));
  if (light && clauses.length > 0) clauses.push(light);

  let summary = clauses.length > 0 ? `${clauses.join(', ')}.` : 'Tide data only — wind and rain forecast unavailable.';

  const clothing = clothingAdvice(input, slots, aheadWind, rain, light !== null);
  if (clothing) {
    summary += ` Wear ${clothing.garment}${clothing.extra ? ` — ${clothing.extra}` : ''}.`;
  }

  return {
    summary,
    outlook: buildOutlook(input, slots, tense),
  };
}
