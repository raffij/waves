import type { DaylightSeries } from '../services/DaylightSeries';
import { TideClock } from '../services/TideClock';

// Chart geometry for the day's light: which stretches of the plotted window
// are before sunrise or after sunset, where the two moments sit along the
// x-axis, and the times themselves for the legend. Shared by the tide and
// precipitation charts so both shade the dark hours identically.

export interface DaylightBands {
  /** Stretches of the window that are dark, as x-ranges to shade. */
  night: Array<{ key: string; x: number; width: number }>;
  /** Sunrise / sunset moments that fall inside the window, as x positions. */
  marks: Array<{ key: string; x: number }>;
  /** e.g. "Light 07:52–16:05" — null when sunrise/sunset didn't load. */
  label: string | null;
}

const EMPTY: DaylightBands = { night: [], marks: [], label: null };
const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
// Below this a band is thinner than its own edge line, so it reads as an
// artefact rather than a stretch of darkness — drop it.
const MIN_BAND_WIDTH = 1;

export function daylightBands(args: {
  series: DaylightSeries | null | undefined;
  start: Date;
  end: Date;
  plotLeft: number;
  plotWidth: number;
}): DaylightBands {
  const { series, start, end, plotLeft, plotWidth } = args;
  // The window's own day, not `now`: on a selected day the chart is drawn
  // around that day's hours, so its sunrise/sunset are the ones to plot.
  const sunrise = series?.sunrise(start) ?? null;
  const sunset = series?.sunset(start) ?? null;
  if (!sunrise || !sunset) return EMPTY;

  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return EMPTY;
  const toX = (t: Date) => plotLeft + Math.min(Math.max((t.getTime() - start.getTime()) / totalMs, 0), 1) * plotWidth;

  const night: DaylightBands['night'] = [];
  const marks: DaylightBands['marks'] = [];

  const dawnEnd = toX(sunrise);
  if (dawnEnd - plotLeft >= MIN_BAND_WIDTH) night.push({ key: 'dawn', x: plotLeft, width: dawnEnd - plotLeft });

  const duskStart = toX(sunset);
  const plotRight = plotLeft + plotWidth;
  if (plotRight - duskStart >= MIN_BAND_WIDTH) night.push({ key: 'dusk', x: duskStart, width: plotRight - duskStart });

  const inWindow = (t: Date) => t.getTime() > start.getTime() && t.getTime() < end.getTime();
  if (inWindow(sunrise)) marks.push({ key: 'sunrise', x: dawnEnd });
  if (inWindow(sunset)) marks.push({ key: 'sunset', x: duskStart });

  return {
    night,
    marks,
    label: `Light ${TideClock.format(sunrise, HHMM)}–${TideClock.format(sunset, HHMM)}`,
  };
}
