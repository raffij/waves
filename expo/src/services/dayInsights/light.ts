import { DAY_WINDOW_END_HOUR } from '../DayWindow';
import { TideClock } from '../TideClock';
import { hhmm } from './format';
import { dayTense, lightBounds } from './window';
import type { DayInsightsInput } from './types';

// "it will be dark by 16:21", for a day whose sunset lands inside the window and is
// still ahead. Omitted entirely for a day that's already over (there's
// nothing left to warn about), when the light holds to the end of the
// window, when today's sunset has already passed, and when sunrise/sunset
// never loaded.
export function lightClause(input: DayInsightsInput): string | null {
  const { sunset, known } = lightBounds(input);
  const tense = dayTense(input.reference);
  if (!known || tense === 'past') return null;
  const windowEnd = TideClock.londonDateAtHour(input.reference, DAY_WINDOW_END_HOUR);
  if (sunset.getTime() >= windowEnd.getTime()) return null;
  if (tense === 'today' && sunset.getTime() <= input.reference.getTime()) return null;
  return `it will be dark by ${hhmm(sunset)}`;
}
