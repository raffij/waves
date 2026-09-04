import { angularDelta, circularMean, compassPointFor } from '../WindSeries';
import type { CompassPoint, WindSeries } from '../WindSeries';
import { average } from './format';
import { afternoonSlots, type DayTense, morningSlots, type Slot } from './window';

export const WIND_BAND_BREEZY_MPH = 12; // sentence bands: <12 calm, 12–24 breezy, ≥24 windy
export const WIND_BAND_WINDY_MPH = 24;
// A gust that doesn't clear the day's peak sustained speed by at least this
// much reads as within the normal spread of a gusty wind, not a separate
// figure worth naming on top of the peak the sentence already gives —
// the same "don't manufacture a signal out of noise" rule
// WIND_DIRECTION_SHIFT_THRESHOLD_DEG and STEADY_THRESHOLD_MPH apply.
export const WIND_GUST_EXCESS_MPH = 10;
// A morning-to-afternoon swing in mean wind direction below this reads as
// noise — the sentence names a single "from the <point>" rather than
// manufacturing a backing/veering story out of a few degrees of wander.
export const WIND_DIRECTION_SHIFT_THRESHOLD_DEG = 45;

type WindBand = 'calm' | 'breezy' | 'windy';

const BAND_WORD: Record<WindBand, string> = { calm: 'Calm', breezy: 'Breezy', windy: 'Windy' };
const BAND_RANK: Record<WindBand, number> = { calm: 0, breezy: 1, windy: 2 };

export function bandFor(mph: number): WindBand {
  if (mph < WIND_BAND_BREEZY_MPH) return 'calm';
  if (mph < WIND_BAND_WINDY_MPH) return 'breezy';
  return 'windy';
}

interface WindReading {
  mean: number;
  peak: number;
}

export function windOver(slots: Slot[], windSeries: WindSeries | null): WindReading | null {
  if (!windSeries) return null;
  const speeds = slots.map((s) => windSeries.speedAt(s.at)).filter((mph): mph is number => mph !== null);
  if (speeds.length === 0) return null;
  return { mean: average(speeds), peak: Math.max(...speeds) };
}

// The single highest gust reading over the given slots — null wherever the
// forecast carries no gust data at all (older cached data, or the field
// temporarily missing), same fallback windOver/directionOver already apply.
function gustPeakOver(slots: Slot[], windSeries: WindSeries | null): number | null {
  if (!windSeries) return null;
  const gusts = slots.map((s) => windSeries.gustAt(s.at)).filter((mph): mph is number => mph !== null);
  return gusts.length > 0 ? Math.max(...gusts) : null;
}

// Full compass-point names as the sentence says them ("from the
// southwest"), keyed off the same 8-point WindSeries.compassPointFor the
// current-conditions stat uses, so the two can never disagree about what a
// given degree reading is called.
const COMPASS_NAME: Record<CompassPoint, string> = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};

function directionOver(slots: Slot[], windSeries: WindSeries | null): number | null {
  if (!windSeries) return null;
  const degrees = slots.map((s) => windSeries.directionAt(s.at)).filter((deg): deg is number => deg !== null);
  return degrees.length > 0 ? circularMean(degrees) : null;
}

export interface WindShape {
  morningBand: WindBand;
  afternoonBand: WindBand;
  afternoonPeak: number;
  // Highest sustained speed anywhere in the window — what a gust reading is
  // measured against to decide whether it's worth naming (see windClause).
  peak: number;
  // Highest gust reading anywhere in the window, null when gust data isn't
  // available (older cached forecasts, or the field temporarily missing from
  // the response) — same fallback `direction` below already gets.
  gustPeak: number | null;
  // Circular mean direction, morning vs. afternoon — null when direction
  // data isn't available (older cached forecasts, or the field temporarily
  // missing from the response) rather than failing the whole wind clause.
  direction: { morning: number; afternoon: number } | null;
}

export function windShape(slots: Slot[], windSeries: WindSeries | null): WindShape | null {
  const all = windOver(slots, windSeries);
  if (!all) return null;
  const morningWindow = morningSlots(slots);
  const afternoonWindow = afternoonSlots(slots);
  const morning = windOver(morningWindow, windSeries);
  const afternoon = windOver(afternoonWindow, windSeries);
  const gustPeak = gustPeakOver(slots, windSeries);

  const allDir = directionOver(slots, windSeries);
  const morningDir = directionOver(morningWindow, windSeries) ?? allDir;
  const afternoonDir = directionOver(afternoonWindow, windSeries) ?? allDir;
  const direction =
    morningDir !== null && afternoonDir !== null ? { morning: morningDir, afternoon: afternoonDir } : null;

  return {
    morningBand: bandFor((morning ?? all).mean),
    afternoonBand: bandFor((afternoon ?? all).mean),
    afternoonPeak: (afternoon ?? all).peak,
    peak: all.peak,
    gustPeak,
    direction,
  };
}

// "from the southwest" when the direction barely shifts across the window;
// "backing/veering from southwest to south" when it swings past the noise
// threshold. Backing (anticlockwise) and veering (clockwise) are the actual
// sailing/forecasting terms — kept rather than invented plain-English ones
// since this is exactly the audience ("Hastings Pier ... 5-day forecast")
// that already knows them.
function windDirectionPhrase(direction: { morning: number; afternoon: number }, tense: DayTense): string {
  const morningPoint = compassPointFor(direction.morning);
  const afternoonPoint = compassPointFor(direction.afternoon);
  const delta = angularDelta(direction.morning, direction.afternoon);

  if (morningPoint === afternoonPoint || Math.abs(delta) < WIND_DIRECTION_SHIFT_THRESHOLD_DEG) {
    return `from the ${COMPASS_NAME[afternoonPoint]}`;
  }

  const verb =
    delta > 0
      ? tense === 'past'
        ? 'veered'
        : tense === 'future'
          ? 'expected to veer'
          : 'veering'
      : tense === 'past'
        ? 'backed'
        : tense === 'future'
          ? 'expected to back'
          : 'backing';
  return `${verb} from ${COMPASS_NAME[morningPoint]} to ${COMPASS_NAME[afternoonPoint]}`;
}

// "this morning" only reads right for today, where it genuinely is this
// morning — a past or future day gets the tense-neutral "in the morning"
// instead, same slot in the sentence.
const MORNING_PHRASE: Record<DayTense, string> = {
  past: 'in the morning',
  today: 'this morning',
  future: 'in the morning',
};

// The direction phrase reads as a trailing clause on whichever speed
// sentence windClause already builds ("Breezy all day, from the
// southwest.") rather than a sentence of its own — wind speed and direction
// are one signal to a reader deciding what to wear or which way to face on
// the pier, not two.
export function windClause(w: WindShape, tense: DayTense): string {
  const morning = MORNING_PHRASE[tense];
  const directionSuffix = w.direction ? `, ${windDirectionPhrase(w.direction, tense)}` : '';
  // Only worth a mention once it clears the day's peak sustained speed by a
  // real margin — otherwise it's just what "breezy"/"windy" already implies,
  // not a distinct figure. Trails the direction, if any, as one more clause
  // on the same sentence rather than a sentence of its own.
  const gustSuffix =
    w.gustPeak !== null && w.gustPeak - w.peak >= WIND_GUST_EXCESS_MPH
      ? `, gusting to ${Math.round(w.gustPeak)}mph`
      : '';
  const suffix = `${directionSuffix}${gustSuffix}`;

  if (w.morningBand === w.afternoonBand) return `${BAND_WORD[w.morningBand]} all day${suffix}`;
  if (BAND_RANK[w.afternoonBand] > BAND_RANK[w.morningBand]) {
    if (tense === 'past') {
      return `${BAND_WORD[w.morningBand]} ${morning}, then wind built to around ${Math.round(
        w.afternoonPeak,
      )}mph by mid-afternoon${suffix}`;
    }
    const build = tense === 'future' ? 'the wind expected to build' : 'wind building';
    return `${BAND_WORD[w.morningBand]} ${morning}, with ${build} to around ${Math.round(
      w.afternoonPeak,
    )}mph by mid-afternoon${suffix}`;
  }
  if (tense === 'past') return `${BAND_WORD[w.morningBand]} ${morning}, then eased through the afternoon${suffix}`;
  const ease = tense === 'future' ? 'the wind expected to ease' : 'wind easing';
  return `${BAND_WORD[w.morningBand]} ${morning}, with ${ease} through the afternoon${suffix}`;
}
