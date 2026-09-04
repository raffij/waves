import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from '../DayWindow';
import { TideClock } from '../TideClock';
import { HOUR_MS } from './format';
import type { DayInsightsInput } from './types';

// The 06:00–20:00 day window (see DayWindow), sliced into on-the-hour
// slots and morning/afternoon segments. Every domain reads the day through
// these, so the sentence, the clothing call and the bars can never
// disagree about where "the day" or "the afternoon" starts.

export const FALLBACK_SUNRISE_HOUR = 7; // light bounds used only when sunrise/sunset is unavailable
export const FALLBACK_SUNSET_HOUR = 21;

export interface Slot {
  hour: number;
  at: Date;
  isLight: boolean;
}

export interface LightBounds {
  sunrise: Date;
  sunset: Date;
  // False when these are the fixed fallback hours rather than real
  // sunrise/sunset — the readout never quotes a made-up time.
  known: boolean;
}

export function lightBounds(input: DayInsightsInput): LightBounds {
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
export function windowSlots(input: DayInsightsInput): Slot[] {
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
export function morningSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.hour <= 12);
}

export function afternoonSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.hour >= 13);
}

export type DayTense = 'past' | 'today' | 'future';

export function dayTense(reference: Date): DayTense {
  const todayKey = TideClock.dateKey(new Date());
  const refKey = TideClock.dateKey(reference);
  if (refKey < todayKey) return 'past';
  if (refKey > todayKey) return 'future';
  return 'today';
}

// What's left of the window: on today, the hours not yet over; on any other
// day, all of it. The clothing call keys off these — advice for a day is
// advice for the part of it you can still walk out into.
export function remainingSlots(input: DayInsightsInput, slots: Slot[]): Slot[] {
  if (dayTense(input.reference) !== 'today') return slots;
  const ahead = slots.filter((s) => s.at.getTime() + HOUR_MS > input.reference.getTime());
  return ahead.length > 0 ? ahead : slots.slice(-1);
}
