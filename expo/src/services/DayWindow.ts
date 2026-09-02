// The slice of the day every view reasons about: 06:00 to 20:00 London
// time. Both charts plot it and the day-insights read judges wind, rain and
// light within it, so the sentence, the clothing call and the bars can
// never disagree about what "the day" was.
export const DAY_WINDOW_START_HOUR = 6;
export const DAY_WINDOW_END_HOUR = 20;

// "daytime" reads only the waking hours above — the figures that actually
// help decide what to do with the day, rather than a high/low dragged down
// by 3am. "wholeDay" reads the full 24h. Shared by the forecast list and
// the charts so a single footer toggle (App.tsx) drives both consistently.
export type ForecastWindow = 'daytime' | 'wholeDay';

// Resolved start/end hours for a ForecastWindow. Named `hours` at call
// sites rather than `window` (unlike the `ForecastWindow` prop, which
// takes the prop-naming convention from `detail`) to avoid shadowing the
// DOM/browser `window` global this runs under on web.
export interface Hours {
  startHour: number;
  endHour: number;
}

// endHour is the window's right *boundary* (matching DAYTIME_HOURS, whose
// 20 is 8pm, not "the last hour to sample") — so a whole day runs 0 to 24
// (midnight to midnight), not 0 to 23. TideClock.londonDateAtHour normalizes
// hour 24 to 00:00 the next day, so this lands on the correct instant.
const WHOLE_DAY_HOURS: Hours = { startHour: 0, endHour: 24 };
const DAYTIME_HOURS: Hours = { startHour: DAY_WINDOW_START_HOUR, endHour: DAY_WINDOW_END_HOUR };

export function hoursFor(forecastWindow: ForecastWindow): Hours {
  return forecastWindow === 'daytime' ? DAYTIME_HOURS : WHOLE_DAY_HOURS;
}
