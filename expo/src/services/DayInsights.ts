import type { DaylightSeries } from './DaylightSeries';
import type { PrecipitationSeries } from './PrecipitationSeries';
import { TideClock } from './TideClock';
import type { WindSeries } from './WindSeries';

// Tuning knobs for the day-insights readout. "Good" here is a
// walk-on-the-pier judgement — light wind, little/no rain, in daylight —
// not a water-sports one; tide is reported but never scored. Retune by
// editing these.
export const MAX_COMFORTABLE_WIND_MPH = 16; // ~Beaufort 4/5 boundary; above this a pier walk is unpleasant
export const WET_HOUR_MM = 0.2; // hourly precip total above this counts as a "wet hour" for window scoring
export const MIN_WINDOW_HOURS = 2; // a fully-ahead window shorter than this isn't worth calling out
export const MIN_REMAINING_WINDOW_HOURS = 1; // today: if less of an in-progress window is left, look past it
export const WIND_BAND_BREEZY_MPH = 12; // sentence bands: <12 calm, 12–24 breezy, ≥24 windy
export const WIND_BAND_WINDY_MPH = 24;
export const FALLBACK_DAY_START_HOUR = 7; // daylight bounds used only when sunrise/sunset is unavailable
export const FALLBACK_DAY_END_HOUR = 21;
// Rain is judged over this window rather than just daylight hours — it
// matches PrecipitationChart's own 06:00–22:00 span, so the sentence and
// the bars can never disagree about whether it rains.
export const RAIN_WINDOW_START_HOUR = 6;
export const RAIN_WINDOW_END_HOUR = 22;
export const RAIN_DOMINATES_FRACTION = 0.55; // a single spell covering this share of the window reads as "most of the day"
export const RAIN_LONG_SPELL_HOURS = 4; // at/above this, a spell gets a "through the morning/afternoon/middle" phrase

export type BestWindow = { kind: 'window'; label: string } | { kind: 'none'; label: string };

export interface DayInsights {
  summarySentence: string;
  bestWindow: BestWindow;
}

export interface DayInsightsInput {
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
  daylightSeries: DaylightSeries | null;
  reference: Date;
  isToday: boolean;
}

const HOUR_MS = 3_600_000;
const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

function hhmm(date: Date): string {
  return TideClock.format(date, HHMM);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// --- daylight window ---------------------------------------------------------

interface Slot {
  hour: number;
  at: Date;
}

// On-the-hour slots between sunrise and sunset for the reference day, or the
// fixed fallback range when daylight data is missing.
function daylightSlots(input: DayInsightsInput): Slot[] {
  const { reference, daylightSeries } = input;
  const sunrise = daylightSeries?.sunrise(reference) ?? null;
  const sunset = daylightSeries?.sunset(reference) ?? null;

  if (sunrise && sunset) {
    const within: Slot[] = [];
    for (let h = 0; h <= 23; h++) {
      const at = TideClock.londonDateAtHour(reference, h);
      if (at.getTime() >= sunrise.getTime() && at.getTime() <= sunset.getTime()) within.push({ hour: h, at });
    }
    if (within.length > 0) return within;
  }

  const fallback: Slot[] = [];
  for (let h = FALLBACK_DAY_START_HOUR; h <= FALLBACK_DAY_END_HOUR; h++) {
    fallback.push({ hour: h, at: TideClock.londonDateAtHour(reference, h) });
  }
  return fallback;
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

interface WindShape {
  morningBand: WindBand;
  afternoonBand: WindBand;
  afternoonPeak: number;
}

function windShape(slots: Slot[], windSeries: WindSeries | null): WindShape | null {
  if (!windSeries) return null;
  const readings = slots
    .map((s) => ({ hour: s.hour, mph: windSeries.speedAt(s.at) }))
    .filter((r): r is { hour: number; mph: number } => r.mph !== null);
  if (readings.length === 0) return null;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const all = readings.map((r) => r.mph);
  const morning = readings.filter((r) => r.hour <= 12).map((r) => r.mph);
  const afternoon = readings.filter((r) => r.hour >= 13).map((r) => r.mph);
  const overallMean = mean(all);

  return {
    morningBand: bandFor(morning.length ? mean(morning) : overallMean),
    afternoonBand: bandFor(afternoon.length ? mean(afternoon) : overallMean),
    afternoonPeak: Math.max(...(afternoon.length ? afternoon : all)),
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

interface RainSpell {
  start: Date;
  end: Date; // last wet hour + 1h
  hours: number;
}

type DayTense = 'past' | 'today' | 'future';

function dayTense(reference: Date): DayTense {
  const todayKey = TideClock.dateKey(new Date());
  const refKey = TideClock.dateKey(reference);
  if (refKey < todayKey) return 'past';
  if (refKey > todayKey) return 'future';
  return 'today';
}

// Contiguous runs of wet hours within the window.
function rainSpells(bars: Array<{ time: Date; mm: number | null }>): RainSpell[] {
  const spells: RainSpell[] = [];
  let run: Date[] = [];
  const flush = () => {
    if (run.length === 0) return;
    spells.push({ start: run[0], end: new Date(run[run.length - 1].getTime() + HOUR_MS), hours: run.length });
    run = [];
  };
  for (const b of bars) {
    if ((b.mm ?? 0) > WET_HOUR_MM) run.push(b.time);
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

// Lower-case fragment for the summary sentence, e.g.
// "rain through the middle of the day, 10:00 to 15:00".
function rainClause(input: DayInsightsInput, precip: PrecipitationSeries | null): string | null {
  if (!precip) return null;

  const windowStart = TideClock.londonDateAtHour(input.reference, RAIN_WINDOW_START_HOUR);
  const windowEnd = TideClock.londonDateAtHour(input.reference, RAIN_WINDOW_END_HOUR);
  const bars = precip.hourlyBars(windowStart, windowEnd);
  const tense = dayTense(input.reference);

  // On today, spells that have already finished aren't worth mentioning.
  const spells = rainSpells(bars).filter((s) => tense !== 'today' || s.end.getTime() > input.reference.getTime());

  if (spells.length === 0) {
    return tense === 'past' ? 'stayed dry' : tense === 'future' ? 'likely dry' : 'staying dry';
  }

  const midday = windowStart.getTime() + (windowEnd.getTime() - windowStart.getTime()) / 2;

  if (spells.length > 1) {
    const allBeforeMidday = spells.every((s) => s.end.getTime() <= midday);
    const allAfterMidday = spells.every((s) => s.start.getTime() >= midday);
    const when = allBeforeMidday ? ' in the morning' : allAfterMidday ? ' in the afternoon' : ' through the day';
    const lead =
      tense === 'future' ? 'showers likely' : tense === 'past' ? 'showers came and went' : 'showers on and off';
    return `${lead}${when}`;
  }

  const s = spells[0];
  const range = `${hhmm(s.start)} to ${hhmm(s.end)}`;

  // Today, rain already under way — the start is behind us, so lead with the end.
  if (tense === 'today' && s.start.getTime() <= input.reference.getTime()) {
    return `rain until ${hhmm(s.end)}`;
  }

  const coverage = rainCoverage(s, bars.length, windowStart, windowEnd);
  const likely = tense === 'future' ? 'likely ' : '';
  return coverage ? `rain ${likely}${coverage}, ${range}` : `rain ${likely}from ${range}`;
}

// --- best window -------------------------------------------------------------

function bestWindow(
  input: DayInsightsInput,
  slots: Slot[],
  windSeries: WindSeries | null,
  precip: PrecipitationSeries | null,
): BestWindow {
  const nowMs = input.reference.getTime();

  const isGood = (s: Slot): boolean => {
    const mph = windSeries?.speedAt(s.at) ?? null;
    if (mph === null || mph > MAX_COMFORTABLE_WIND_MPH) return false;
    if (precip && (precip.mmAt(s.at) ?? 0) > WET_HOUR_MM) return false;
    return true;
  };

  const runs: Slot[][] = [];
  let run: Slot[] = [];
  for (const s of slots) {
    if (isGood(s)) {
      run.push(s);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  const candidates = runs
    .map((r) => (input.isToday ? r.filter((s) => s.at.getTime() + HOUR_MS > nowMs) : r))
    .filter((r) => r.length > 0)
    .map((r) => {
      const endAt = new Date(r[r.length - 1].at.getTime() + HOUR_MS);
      const inProgress = input.isToday && r[0].at.getTime() <= nowMs;
      const startAt = inProgress ? input.reference : r[0].at;
      const lengthHours = (endAt.getTime() - startAt.getTime()) / HOUR_MS;
      return { startAt, endAt, lengthHours, inProgress };
    })
    .filter((w) => w.lengthHours >= (w.inProgress ? MIN_REMAINING_WINDOW_HOURS : MIN_WINDOW_HOURS));

  if (candidates.length === 0) {
    // A real window existed earlier today, it's just behind us now — say so
    // rather than calling a calm morning "marginal".
    const hadWindowToday = input.isToday && runs.some((r) => r.length >= MIN_WINDOW_HOURS);
    return {
      kind: 'none',
      label: hadWindowToday ? 'Best window has passed for today' : 'Conditions look marginal all day',
    };
  }

  candidates.sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || b.lengthHours - a.lengthHours);
  const w = candidates[0];
  return { kind: 'window', label: `${w.inProgress ? 'now' : hhmm(w.startAt)}–${hhmm(w.endAt)}` };
}

// --- entry point --------------------------------------------------------------

export function buildDayInsights(input: DayInsightsInput): DayInsights {
  const slots = daylightSlots(input);
  const wind = windShape(slots, input.windSeries);
  const rain = rainClause(input, input.precipitationSeries);

  let summarySentence: string;
  if (wind && rain) summarySentence = `${windClause(wind)}, ${rain}.`;
  else if (wind) summarySentence = `${windClause(wind)}.`;
  else if (rain) summarySentence = `${capitalize(rain)}.`;
  else summarySentence = 'Tide data only — wind and rain forecast unavailable.';

  return {
    summarySentence,
    bestWindow: bestWindow(input, slots, input.windSeries, input.precipitationSeries),
  };
}
