import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from '../DayWindow';
import type { PrecipitationSeries } from '../PrecipitationSeries';
import { TideClock } from '../TideClock';
import { HOUR_MS, hhmm } from './format';
import { type DayTense, dayTense, type Slot } from './window';
import type { DayInsightsInput } from './types';

export const WET_HOUR_MM = 0.2; // hourly precip total above this counts as a "wet hour"
// Rain intensity read off the wettest hour in the window: below DRIZZLE it's
// drizzle, below HEAVY it's showery, at/above HEAVY it's heavy rain.
export const DRIZZLE_PEAK_MM = 0.5;
export const HEAVY_PEAK_MM = 2;
export const RAIN_DOMINATES_FRACTION = 0.55; // a single spell covering this share of the window reads as "most of the day"
export const RAIN_LONG_SPELL_HOURS = 4; // at/above this, a spell gets a "through the morning/afternoon/middle" phrase

export type RainBand = 'dry' | 'drizzle' | 'showery' | 'heavy';

export function rainBandFor(peakMm: number): RainBand {
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
  mms: number[]; // one entry per wet hour, in order — how hard it's coming down across the spell
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
      mms: run.map((r) => r.mm),
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

const RAIN_BAND_RANK: Record<RainBand, number> = { dry: 0, drizzle: 1, showery: 2, heavy: 3 };

// How a single spell's intensity changes from its start to its end — read
// off the first and last third of its wet hours (at least one hour each),
// wide enough that a single wetter or drier hour can't flip the read but
// still narrow enough to catch a spell that genuinely changes character
// partway through (drizzle building to a downpour, a downpour tailing off
// to showers). Only worth mentioning for a spell long enough that this
// reads as a real trend — the same length rainCoverage requires before it
// characterises a spell at all.
function rainIntensityTrend(mms: number[], tense: DayTense): { startBand: RainBand; phrase: string } | null {
  if (mms.length < RAIN_LONG_SPELL_HOURS) return null;
  const edge = Math.max(1, Math.floor(mms.length / 3));
  const startBand = rainBandFor(Math.max(...mms.slice(0, edge)));
  const endBand = rainBandFor(Math.max(...mms.slice(-edge)));
  if (startBand === endBand) return null;
  const endWord = RAIN_NOUN[endBand].single;
  const building = RAIN_BAND_RANK[endBand] > RAIN_BAND_RANK[startBand];
  const verb = building
    ? tense === 'past'
      ? 'built to'
      : tense === 'future'
        ? 'expected to build to'
        : 'building to'
    : tense === 'past'
      ? 'eased to'
      : tense === 'future'
        ? 'expected to ease to'
        : 'easing to';
  return { startBand, phrase: `${verb} ${endWord}` };
}

// Lower-case fragment for the summary sentence, plus what the clothing call
// keys off (it never parses `text`):
//   wet       — rain is still to come or under way in the rest of the day
//   groundWet — today only: rain fell earlier but is done, so the pier
//               stays wet underfoot even though `wet` is false
export interface RainClause {
  text: string;
  wet: boolean;
  groundWet: boolean;
}

export function rainClause(input: DayInsightsInput, precip: PrecipitationSeries | null): RainClause | null {
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

  // Today, rain already under way — the start is behind us, so lead with the
  // end, but still describe how what's left of it changes (only the hours
  // still ahead, not the part already fallen).
  if (tense === 'today' && s.start.getTime() <= input.reference.getTime()) {
    const elapsedHours = Math.floor((input.reference.getTime() - s.start.getTime()) / HOUR_MS);
    const remainingTrend = rainIntensityTrend(s.mms.slice(Math.max(0, elapsedHours)), tense);
    const suffix = remainingTrend ? `, ${remainingTrend.phrase}` : '';
    return { text: `${noun.single} continues until ${hhmm(s.end)}${suffix}`, wet: true, groundWet: false };
  }

  const coverage = rainCoverage(s, bars.length, windowStart, windowEnd);
  const trend = rainIntensityTrend(s.mms, tense);
  const leadNoun = trend ? RAIN_NOUN[trend.startBand].single : noun.single;
  const past = tense === 'past' ? 'fell ' : '';
  const likely = tense === 'future' ? 'is likely ' : '';
  const suffix = trend ? `, ${trend.phrase}` : '';
  return {
    text: coverage
      ? `${leadNoun} ${past}${likely}${coverage}${suffix}, from ${range}`
      : `${leadNoun} ${past}${likely}from ${range}${suffix}`,
    wet: true,
    groundWet: false,
  };
}

// The wettest hour over a set of slots, in mm. 0 when the forecast has
// nothing to say about those hours.
export function rainPeakOver(slots: Slot[], precip: PrecipitationSeries | null): number {
  if (!precip) return 0;
  const mms = slots.map((s) => precip.mmAt(s.at)).filter((mm): mm is number => mm !== null);
  return mms.length > 0 ? Math.max(...mms) : 0;
}

export function rainSentence(rain: RainClause, tense: DayTense): string {
  if (rain.wet) return rain.text;
  if (tense === 'past') return 'the day stayed dry';
  if (tense === 'today') return 'the rest of the day should stay dry';
  return 'the day should stay dry';
}

export function dryConditionsClause(tense: DayTense): string {
  if (tense === 'past') return 'with dry conditions throughout';
  if (tense === 'today') return 'with no further rain expected';
  return 'with dry conditions expected';
}
