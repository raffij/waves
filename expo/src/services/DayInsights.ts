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
// Only actually reachable under a clear sky — see the CLOUD_BAND_CLEAR_PCT
// gate in sunBandFor below, which demotes a bright-but-cloudy reading before
// it ever gets here. Tuned down from an initial 600: a clear 500 W/m² sky
// already reads as genuinely intense in practice, not merely "sunny".
export const SUN_BAND_STRONG_WM2 = 450;
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
// reads as noise — the readout says the day stays much the same rather than
// manufacturing a warming/cooling trend out of half a degree.
export const FEELS_TREND_THRESHOLD_C = 2;
export const FALLBACK_SUNRISE_HOUR = 7; // light bounds used only when sunrise/sunset is unavailable
export const FALLBACK_SUNSET_HOUR = 21;
export const RAIN_DOMINATES_FRACTION = 0.55; // a single spell covering this share of the window reads as "most of the day"
export const RAIN_LONG_SPELL_HOURS = 4; // at/above this, a spell gets a "through the morning/afternoon/middle" phrase
export const DARK_MAJORITY_FRACTION = 0.5; // above this share of the hours left, the call shifts to keeping warm

export interface DayInsights {
  // The day's conditions — wind, rain, sun, feel, light — and what to wear,
  // as one flowing, wordy description rather than separate fields that repeat
  // the same signals.
  summary: string;
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

// The morning/afternoon split every trend reading (wind shape, rain/sun/feel)
// uses, so they can never disagree about where "afternoon" starts.
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
    if (tense === 'past') {
      return `${BAND_WORD[w.morningBand]} ${morning}, then wind built to around ${Math.round(
        w.afternoonPeak,
      )}mph by mid-afternoon`;
    }
    const build = tense === 'future' ? 'the wind expected to build' : 'wind building';
    return `${BAND_WORD[w.morningBand]} ${morning}, with ${build} to around ${Math.round(
      w.afternoonPeak,
    )}mph by mid-afternoon`;
  }
  if (tense === 'past') return `${BAND_WORD[w.morningBand]} ${morning}, then eased through the afternoon`;
  const ease = tense === 'future' ? 'the wind expected to ease' : 'wind easing';
  return `${BAND_WORD[w.morningBand]} ${morning}, with ${ease} through the afternoon`;
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
        ? `${noun.repeated} are likely`
        : tense === 'past'
          ? `${noun.repeated} came and went`
          : `${noun.repeated} may come and go`;
    return { text: `${lead}${when}`, wet: true, groundWet: false };
  }

  const s = spells[0];
  const range = `${hhmm(s.start)} to ${hhmm(s.end)}`;

  // Today, rain already under way — the start is behind us, so lead with the end.
  if (tense === 'today' && s.start.getTime() <= input.reference.getTime()) {
    return { text: `${noun.single} continues until ${hhmm(s.end)}`, wet: true, groundWet: false };
  }

  const coverage = rainCoverage(s, bars.length, windowStart, windowEnd);
  const past = tense === 'past' ? 'fell ' : '';
  const likely = tense === 'future' ? 'is likely ' : '';
  return {
    text: coverage
      ? `${noun.single} ${past}${likely}${coverage}, from ${range}`
      : `${noun.single} ${past}${likely}from ${range}`,
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

// --- sun ---------------------------------------------------------------------

// `strong` sits above `sunny` — genuinely intense sun (high-summer clear
// midday, the kind that wants sunscreen), not just "brighter than hazy".
// Cloud cover has no opinion above `sunny` (a clear reading just means
// nothing is holding brightness back, not that today's specific peak is
// unusually strong) — see the `strong`→`sunny` collapse in sunBandFor below.
export type SunBand = 'overcast' | 'hazy' | 'sunny' | 'strong';
const SUN_BAND_RANK: Record<SunBand, number> = { overcast: 0, hazy: 1, sunny: 2, strong: 3 };
// The 3-tier band cloud cover can actually speak to — `strong` collapses to
// `sunny` for the comparison in sunBandFor, since cloud % alone can't tell
// "clear" from "clear and unusually intense".
const CLOUD_COMPARABLE_BAND: Record<SunBand, 'overcast' | 'hazy' | 'sunny'> = {
  overcast: 'overcast',
  hazy: 'hazy',
  sunny: 'sunny',
  strong: 'sunny',
};
// Brightness and cloud cover each vote for a band; whichever reads cloudier
// wins. That resolves both ways a single signal misleads on its own: a
// bright reading under a fully overcast sky is diffuse light through cloud,
// not real sun (brightness alone says sunny, cloud cover corrects it to
// overcast) — and a low cloud-cover reading before sunrise/after sunset is
// just dark, not sunny (cloud cover alone says sunny, brightness corrects it
// to overcast). Either signal missing, the other decides alone. Cloud cover
// only ever demotes, never promotes past `sunny` — a clear reading can't
// tell "strong" from merely "sunny", only brightness can.
export function sunBandFor(peakWm2: number | null, minCloudPct: number | null): SunBand {
  const brightBand: SunBand | null =
    peakWm2 === null
      ? null
      : peakWm2 < SUN_BAND_HAZY_WM2
        ? 'overcast'
        : peakWm2 < SUN_BAND_SUNNY_WM2
          ? 'hazy'
          : peakWm2 < SUN_BAND_STRONG_WM2
            ? 'sunny'
            : 'strong';
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
  return SUN_BAND_RANK[cloudBand] < SUN_BAND_RANK[CLOUD_COMPARABLE_BAND[brightBand]] ? cloudBand : brightBand;
}

interface SunReading {
  peak: number;
  minCloudPct: number | null;
}

function sunOver(slots: Slot[], sun: SunBrightnessSeries | null, cloud: CloudCoverSeries | null): SunReading | null {
  if (!sun) return null;
  const readings = slots
    .map((s) => ({ wm2: sun.brightnessAt(s.at), cloudPct: cloud ? cloud.coverageAt(s.at) : null }))
    .filter((r): r is { wm2: number; cloudPct: number | null } => r.wm2 !== null);
  if (readings.length === 0) return null;

  // Band each hour on its own brightness/cloud pair and report the
  // best-banded hour, rather than the window's brightest hour and its
  // clearest hour picked independently (they can be different hours) — that
  // would pair a brief clearing's brightness with an unrelated hour's clear
  // sky and overstate how sunny the window was.
  let best = readings[0];
  let bestRank = SUN_BAND_RANK[sunBandFor(best.wm2, best.cloudPct)];
  for (const r of readings.slice(1)) {
    const rank = SUN_BAND_RANK[sunBandFor(r.wm2, r.cloudPct)];
    if (rank > bestRank) {
      best = r;
      bestRank = rank;
    }
  }
  return { peak: best.wm2, minCloudPct: best.cloudPct };
}

// How strong the sun gets, morning vs. afternoon — brightening, clouding
// over, or one band held all day. This is phrased as a complete, natural
// fragment because it now lives in the same paragraph as the headline
// conditions rather than on a second line.
function sunTrendClause(
  slots: Slot[],
  sun: SunBrightnessSeries | null,
  cloud: CloudCoverSeries | null,
  tense: DayTense,
): string | null {
  const morning = sunOver(morningSlots(slots), sun, cloud);
  const afternoon = sunOver(afternoonSlots(slots), sun, cloud);
  if (!morning && !afternoon) return null;

  const morningReading = morning ?? afternoon ?? { peak: 0, minCloudPct: null };
  const afternoonReading = afternoon ?? morning ?? { peak: 0, minCloudPct: null };
  const morningBand = sunBandFor(morningReading.peak, morningReading.minCloudPct);
  const afternoonBand = sunBandFor(afternoonReading.peak, afternoonReading.minCloudPct);
  if (morningBand === afternoonBand) {
    if (morningBand === 'overcast') {
      return tense === 'past'
        ? 'the day stayed overcast'
        : tense === 'today'
          ? 'the rest of the day looks overcast'
          : 'the day should stay overcast';
    }
    if (morningBand === 'hazy') {
      return tense === 'past'
        ? 'hazy sunshine lingered through the day'
        : tense === 'today'
          ? 'hazy sunshine should linger through the rest of the day'
          : 'hazy sunshine is likely through the day';
    }
    if (morningBand === 'strong') {
      return tense === 'past'
        ? 'strong sunshine lasted through the day'
        : tense === 'today'
          ? 'strong sunshine should continue through the rest of the day'
          : 'strong sunshine is likely through the day';
    }
    return tense === 'past'
      ? 'sunny spells lasted through the day'
      : tense === 'today'
        ? 'sunny spells should continue through the rest of the day'
        : 'sunny spells are likely through the day';
  }

  const afternoonPhrase = tense === 'today' ? 'this afternoon' : 'by afternoon';
  if (SUN_BAND_RANK[afternoonBand] > SUN_BAND_RANK[morningBand]) {
    return tense === 'past'
      ? `sunshine broke through ${afternoonPhrase}`
      : `sunshine should break through ${afternoonPhrase}`;
  }
  return tense === 'past' ? `cloud thickened ${afternoonPhrase}` : `cloud may thicken ${afternoonPhrase}`;
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

// Named alongside the figures ("it should feel mild, around 14–17°C") rather
// than left as bare numbers — the band is what answers "is that comfortable?",
// the range is the detail underneath it.
function feelsPhrase(feels: FeelsReading, tense: DayTense): string {
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
function feelsTrendClause(slots: Slot[], temp: TemperatureSeries | null, tense: DayTense): string | null {
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

// --- light ------------------------------------------------------------------

// "it will be dark by 16:21", for a day whose sunset lands inside the window and is
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
  return `it will be dark by ${hhmm(sunset)}`;
}

// --- clothing ---------------------------------------------------------------

// Top and bottom are read off the feels-like band (see TempBand) — the same
// bands the temperature sentence already names, so "it feels mild" and
// "wear a jumper" can never disagree. Rain overrides the top outright: a
// wet forecast means a dry robe regardless of temperature, since none of
// the wardrobe's other tops are rainproof.
const TOP_FOR_TEMP: Record<TempBand, string> = {
  cold: 'a jumper',
  cool: 'a jumper',
  mild: 'a jumper',
  warm: 'a t-shirt',
  hot: 'a t-shirt',
};
const WET_TOP = 'a dry robe';

const BOTTOM_FOR_TEMP: Record<TempBand, string> = {
  cold: 'trousers',
  cool: 'trousers',
  mild: 'shorts',
  warm: 'shorts',
  hot: 'shorts',
};

// Footwear is about wet ground first, temperature second: walking boots
// whenever it's rained or is going to, since none of the dry-weather shoes
// are waterproof. Dry and cold enough that sandals would be uncomfortable
// falls back to camper shoes; dry and mild or above takes sandals, no socks.
const FOOTWEAR_FOR_TEMP: Record<TempBand, string> = {
  cold: 'camper shoes',
  cool: 'camper shoes',
  mild: 'sandals',
  warm: 'sandals',
  hot: 'sandals',
};
const WET_FOOTWEAR = 'walking boots';

interface ClothingAdvice {
  top: string;
  bottom: string;
  footwear: string;
  // Context not already covered elsewhere in the summary — the rain band
  // itself is already in the main clauses, so this only carries what it
  // doesn't: wet ground left over from earlier rain, or that it's dark.
  extra: string | null;
}

function clothingAdvice(
  input: DayInsightsInput,
  slots: Slot[],
  rain: RainClause | null,
  feels: FeelsReading | null,
  lightAlreadyStated: boolean,
): ClothingAdvice | null {
  if (dayTense(input.reference) === 'past') return null;
  if (!rain && !feels) return null;

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
  const wet = rainBand !== 'dry';
  const groundWet = rain?.groundWet ?? false;
  const tempBand = feels ? tempBandFor(feels.mean) : 'mild';

  const top = wet ? WET_TOP : TOP_FOR_TEMP[tempBand];
  const bottom = BOTTOM_FOR_TEMP[tempBand];
  const footwear = wet || groundWet ? WET_FOOTWEAR : FOOTWEAR_FOR_TEMP[tempBand];

  const extraParts: string[] = [];
  if (groundWet && !wet) extraParts.push('still wet underfoot');
  if (mostlyDark && !lightAlreadyStated) extraParts.push('after dark');

  return { top, bottom, footwear, extra: extraParts.length > 0 ? extraParts.join(', ') : null };
}

// --- combined readout --------------------------------------------------------

function rainSentence(rain: RainClause, tense: DayTense): string {
  if (rain.wet) return rain.text;
  if (tense === 'past') return 'the day stayed dry';
  if (tense === 'today') return 'the rest of the day should stay dry';
  return 'the day should stay dry';
}

function dryConditionsClause(tense: DayTense): string {
  if (tense === 'past') return 'with dry conditions throughout';
  if (tense === 'today') return 'with no further rain expected';
  return 'with dry conditions expected';
}

function clothingSentence(clothing: ClothingAdvice): string {
  return `Wear ${clothing.top} and ${clothing.bottom}, with ${clothing.footwear}${clothing.extra ? ` — ${clothing.extra}` : ''}`;
}

// The readout is intentionally allowed to be wordy. It is one paragraph, but
// not one giant sentence: the first sentence gives the headline conditions,
// the next develops the light and temperature story, and the final sentence
// turns that into practical advice. Each signal is mentioned once, avoiding
// the old two-part repetition.
function buildReadout(
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

// --- entry point --------------------------------------------------------------

export function buildDayInsights(input: DayInsightsInput): DayInsights {
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
