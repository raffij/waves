import type { Extreme } from '../models/TideModels';
import type { DaylightSeries } from './DaylightSeries';
import type { PrecipitationSeries } from './PrecipitationSeries';
import { TideClock } from './TideClock';
import type { TideForecast } from './TideForecast';
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

export interface DayInsightValue {
  label: string;
  value: string;
}

export type BestWindow = { kind: 'window'; label: string } | { kind: 'none'; label: string };

export interface DayInsights {
  summarySentence: string;
  values: DayInsightValue[];
  bestWindow: BestWindow;
}

export interface DayInsightsInput {
  forecast: TideForecast;
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
  overallMean: number;
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
    overallMean,
  };
}

function windClause(w: WindShape): string {
  if (w.morningBand === w.afternoonBand) return `${BAND_WORD[w.morningBand]} all day`;
  if (BAND_RANK[w.afternoonBand] > BAND_RANK[w.morningBand]) {
    return `${BAND_WORD[w.morningBand]} this morning, wind building to ~${Math.round(w.afternoonPeak)}mph by mid-afternoon`;
  }
  return `${BAND_WORD[w.morningBand]} this morning, easing through the afternoon`;
}

function windValue(w: WindShape): string {
  if (w.morningBand === w.afternoonBand) return `${BAND_WORD[w.morningBand]} (~${Math.round(w.overallMean)}mph)`;
  if (BAND_RANK[w.afternoonBand] > BAND_RANK[w.morningBand]) return `Building to ~${Math.round(w.afternoonPeak)}mph`;
  return 'Easing';
}

// --- rain ----------------------------------------------------------------

interface RainInfo {
  clause: string; // lower-case fragment for the sentence, e.g. "rain likely from 16:00"
  value: string; // short label for the values row, e.g. "From 16:00"
}

function rainInfo(input: DayInsightsInput, precip: PrecipitationSeries | null): RainInfo | null {
  if (!precip) return null;

  const windowStart = TideClock.londonDateAtHour(input.reference, RAIN_WINDOW_START_HOUR);
  const windowEnd = TideClock.londonDateAtHour(input.reference, RAIN_WINDOW_END_HOUR);
  const wet = precip.hourlyBars(windowStart, windowEnd).filter((b) => (b.mm ?? 0) > WET_HOUR_MM);

  // On today, only rain that hasn't finished yet is worth mentioning; on
  // another day, the whole window is "ahead".
  const from = input.isToday ? input.reference : windowStart;
  const upcoming = wet.filter((b) => b.time.getTime() + HOUR_MS > from.getTime());
  if (upcoming.length === 0) return { clause: 'staying dry', value: 'None expected' };

  const first = upcoming[0];
  if (first.time.getTime() > from.getTime()) {
    return { clause: `rain likely from ${hhmm(first.time)}`, value: `From ${hhmm(first.time)}` };
  }

  const lastEnds = new Date(upcoming[upcoming.length - 1].time.getTime() + HOUR_MS);
  if (lastEnds.getTime() <= windowEnd.getTime()) {
    return { clause: `rain clearing by ${hhmm(lastEnds)}`, value: `Clearing by ${hhmm(lastEnds)}` };
  }
  return { clause: 'rain on and off through the day', value: 'On and off' };
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

// --- values ---------------------------------------------------------------

function nextTideValue(extreme: Extreme | null): DayInsightValue | null {
  if (!extreme) return null;
  const at = TideClock.parseLondonWallTime(extreme.localTime);
  if (!at) return null;
  return { label: 'Next tide', value: `${extreme.type === 'high' ? 'High' : 'Low'} ${hhmm(at)}` };
}

function sunValue(input: DayInsightsInput): DayInsightValue | null {
  const sunrise = input.daylightSeries?.sunrise(input.reference) ?? null;
  const sunset = input.daylightSeries?.sunset(input.reference) ?? null;
  if (input.isToday && sunrise && input.reference.getTime() < sunrise.getTime()) {
    return { label: 'Sun', value: `Sunrise ${hhmm(sunrise)}` };
  }
  if (sunset) return { label: 'Sun', value: `Sunset ${hhmm(sunset)}` };
  return null;
}

// --- entry point --------------------------------------------------------------

export function buildDayInsights(input: DayInsightsInput): DayInsights {
  const slots = daylightSlots(input);
  const wind = windShape(slots, input.windSeries);
  const rain = rainInfo(input, input.precipitationSeries);

  let summarySentence: string;
  if (wind && rain) summarySentence = `${windClause(wind)}, ${rain.clause}.`;
  else if (wind) summarySentence = `${windClause(wind)}.`;
  else if (rain) summarySentence = `${capitalize(rain.clause)}.`;
  else summarySentence = 'Tide data only — wind and rain forecast unavailable.';

  const values: DayInsightValue[] = [];
  const nextTide = nextTideValue(input.forecast.nextExtreme(input.reference));
  if (nextTide) values.push(nextTide);
  if (wind) values.push({ label: 'Wind', value: windValue(wind) });
  if (rain) values.push({ label: 'Rain', value: rain.value });
  const sun = sunValue(input);
  if (sun) values.push(sun);

  return {
    summarySentence,
    values,
    bestWindow: bestWindow(input, slots, input.windSeries, input.precipitationSeries),
  };
}
