import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { DaylightSeries } from '../services/DaylightSeries';
import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR, hourTicksFor } from '../services/DayWindow';
import { compassPoint } from '../services/SeaCurrentSeries';
import { TideClock } from '../services/TideClock';
import type { TideSeries } from '../services/TideSeries';
import type { WaveSeries } from '../services/WaveSeries';
import type { WindSeries } from '../services/WindSeries';
import type { Colors } from '../theme';
import { daylightBands } from './daylight';

interface Props {
  series: TideSeries;
  waveSeries?: WaveSeries | null;
  windSeries?: WindSeries | null;
  daylightSeries?: DaylightSeries | null;
  now: Date;
  /** Whether `now` is the real current moment vs. a same-hour projection onto another day (see App.tsx). The past-hours fade only makes sense for today. */
  isToday?: boolean;
  /** Shared scrub reading (dragged/tapped time), lifted to App.tsx so dragging any one chart moves the crosshair on all of them together. Null means "show the live/reference reading". */
  scrubTime?: Date | null;
  onScrub?: (time: Date | null) => void;
  startHour?: number;
  endHour?: number;
  /** Degrees the sea current is flowing TOWARD (oceanographic convention), null when unavailable. */
  currentDirection?: number | null;
  currentVelocity?: number | null;
}

// Centered moving average, smoothing out point-to-point reversals before
// curving. A spline alone still passes exactly through every sample, so a
// sharp up-down-up in the raw values still reads as a pointy zigzag even
// once curved — pre-averaging rounds off those reversals themselves.
function movingAverage(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j];
      count++;
    }
    return sum / count;
  });
}

// Catmull-Rom-to-cubic-bezier spline through the given points. Used for wind,
// where hourly readings genuinely jump around (unlike tide/wave's smooth
// underlying curve), so straight segments between samples read as jagged
// zigzags rather than a fluid trend line.
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const DEFAULT_WIDTH = 320;
const HEIGHT = 115;
const PADDING_X = 8;
const PADDING_LEFT = PADDING_X;
const PADDING_TOP = 26; // extra room for the scrub tooltip
const PADDING_BOTTOM = 4;
const TOOLTIP_WIDTH = 170;
// Veils the elapsed portion of the chart under the screen background color,
// so what's still ahead in the day reads at full strength and what's
// already passed visibly recedes.
const PAST_FADE_OPACITY = 0.55;

export function TideChart({
  series,
  waveSeries,
  windSeries,
  daylightSeries,
  now,
  isToday = true,
  scrubTime = null,
  onScrub,
  startHour = DAY_WINDOW_START_HOUR,
  endHour = DAY_WINDOW_END_HOUR,
  currentDirection = null,
  currentVelocity = null,
}: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const onLayout = (evt: LayoutChangeEvent) => {
    const measured = evt.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - width) > 0.5) setWidth(measured);
  };
  // The tooltip sizes itself to its own text (see its style) rather than a
  // fixed box, so centering it needs its actual rendered width — measured
  // via its own onLayout, since RN has no "give me my intrinsic size"
  // outside of layout. Starts at TOOLTIP_WIDTH so the very first paint
  // (before a layout pass has run) is still positioned sensibly.
  const [tooltipWidth, setTooltipWidth] = useState(TOOLTIP_WIDTH);
  const onTooltipLayout = (evt: LayoutChangeEvent) => {
    const measured = evt.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - tooltipWidth) > 0.5) setTooltipWidth(measured);
  };

  const start = TideClock.londonDateAtHour(now, startHour);
  const end = TideClock.londonDateAtHour(now, endHour);
  const startMs = start.getTime();
  const endMs = end.getTime();

  // Everything here is pure geometry — samples, scaling, SVG path strings —
  // derived from the series and the day window, not from the scrub reading.
  // A drag fires onScrub (and therefore a re-render) on every pointer-move
  // event, and re-walking every sample into fresh path strings that many
  // times a second is what actually made scrubbing feel slow; memoizing it
  // means a scrub only recomputes the cheap "active point" bit below.
  const geometry = useMemo(() => {
    // Shadows the outer start/end with copies built straight from the
    // memoized deps, so this closure only ever reads values the dependency
    // list actually covers.
    const start = new Date(startMs);
    const end = new Date(endMs);
    const tideSamples = series
      .samplesEvery(15, start, end)
      .filter((s): s is { time: Date; height: number } => s.height !== null);
    const waveSamples = waveSeries
      ? waveSeries.samplesEvery(15, start, end).filter((s): s is { time: Date; height: number } => s.height !== null)
      : [];
    const windSamplesRaw = windSeries ? windSeries.samplesEvery(15, start, end) : [];
    const windSamples = windSamplesRaw.filter(
      (s): s is { time: Date; speed: number; gust: number | null } => s.speed !== null,
    );
    // A separate filter from windSamples (rather than reading .gust off it)
    // since a gust reading can be missing for an hour that still has a wind
    // speed — same "gust is optional, wind speed isn't" fallback WindSeries
    // itself applies.
    const gustSamples = windSamplesRaw.filter(
      (s): s is { time: Date; speed: number | null; gust: number } => s.gust !== null,
    );

    const plotWidth = width - PADDING_LEFT - PADDING_X;
    const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const totalMs = endMs - startMs;

    if (tideSamples.length < 2) {
      return { empty: true as const, tideSamples, waveSamples, windSamples, plotWidth, plotHeight, totalMs };
    }

    const tideHeights = tideSamples.map((s) => s.height);
    const tideMinHeight = Math.min(...tideHeights);
    const tideMaxHeight = Math.max(...tideHeights);
    // Axes always start at 0 so bar/line heights read as true magnitudes
    // rather than an exaggerated view of the data's own min-max spread.
    const tideSpread = tideMaxHeight || 1;

    // Wave scaling: separate axis to show smaller wave heights clearly
    const waveHeights = waveSamples.map((s) => s.height);
    const waveMinHeight = waveHeights.length > 0 ? Math.min(...waveHeights) : 0;
    const waveMaxHeight = waveHeights.length > 0 ? Math.max(...waveHeights) : 1;
    const waveSpread = waveMaxHeight || 1;

    // Wind scaling: different unit (mph) with typical range 0-40. Gusts are
    // always ≥ the sustained speed for the same hour, so they're folded into
    // the same spread rather than given their own axis — otherwise a strong
    // gust would plot above the top of the chart.
    const windSpeeds = windSamples.map((s) => s.speed);
    const gustSpeeds = gustSamples.map((s) => s.gust);
    const windMinSpeed = windSpeeds.length > 0 ? Math.min(...windSpeeds) : 0;
    const windMaxSpeed = windSpeeds.length > 0 ? Math.max(...windSpeeds) : 1;
    const gustMaxSpeed = gustSpeeds.length > 0 ? Math.max(...gustSpeeds) : 0;
    const windSpread = Math.max(windMaxSpeed, gustMaxSpeed) || 1;

    const toTideXY = (time: Date, height: number) => {
      const x = PADDING_LEFT + ((time.getTime() - startMs) / totalMs) * plotWidth;
      const y = PADDING_TOP + (1 - height / tideSpread) * plotHeight;
      return { x, y };
    };

    const toWaveXY = (time: Date, height: number) => {
      const x = PADDING_LEFT + ((time.getTime() - startMs) / totalMs) * plotWidth;
      const y = PADDING_TOP + (1 - height / waveSpread) * plotHeight;
      return { x, y };
    };

    const toWindXY = (time: Date, speed: number) => {
      const x = PADDING_LEFT + ((time.getTime() - startMs) / totalMs) * plotWidth;
      const y = PADDING_TOP + (1 - speed / windSpread) * plotHeight;
      return { x, y };
    };

    const tideMidHeight = tideMaxHeight / 2;
    const tideGridLines = [tideMaxHeight, tideMidHeight, 0].map((value) => ({
      value,
      y: toTideXY(start, value).y,
    }));

    const tidePoints = tideSamples.map((s) => toTideXY(s.time, s.height));
    const tidePath = tidePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const floorY = PADDING_TOP + plotHeight;
    const tideAreaPath = `${tidePath} L ${tidePoints[tidePoints.length - 1].x.toFixed(1)} ${floorY} L ${tidePoints[0].x.toFixed(1)} ${floorY} Z`;

    const wavePoints = waveSamples.length > 0 ? waveSamples.map((s) => toWaveXY(s.time, s.height)) : [];
    const wavePath =
      wavePoints.length > 0
        ? wavePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        : '';

    const smoothedWindSpeeds = movingAverage(
      windSamples.map((s) => s.speed),
      3,
    );
    const windPoints = windSamples.map((s, i) => toWindXY(s.time, smoothedWindSpeeds[i]));
    const windPath = smoothPath(windPoints);

    // Smoothed the same way as wind speed (gusts jump around even more from
    // hour to hour), and drawn as its own path rather than a band around the
    // speed line — gust and sustained speed can diverge by enough that a
    // band would dominate the chart.
    const smoothedGusts = movingAverage(
      gustSamples.map((s) => s.gust),
      3,
    );
    const gustPoints = gustSamples.map((s, i) => toWindXY(s.time, smoothedGusts[i]));
    const gustPath = smoothPath(gustPoints);

    // Shading for the hours outside sunrise–sunset, so the curve reads
    // against when it's actually light on the pier.
    const daylight = daylightBands({ series: daylightSeries, start, end, plotLeft: PADDING_LEFT, plotWidth });

    return {
      empty: false as const,
      tideSamples,
      waveSamples,
      windSamples,
      gustSamples,
      plotWidth,
      plotHeight,
      totalMs,
      tideHeights,
      tideMinHeight,
      tideMaxHeight,
      waveHeights,
      waveMinHeight,
      waveMaxHeight,
      windSpeeds,
      windMinSpeed,
      windMaxSpeed,
      gustSpeeds,
      toTideXY,
      tideGridLines,
      tidePath,
      tideAreaPath,
      wavePath,
      windPath,
      gustPath,
      floorY,
      daylight,
    };
  }, [series, waveSeries, windSeries, daylightSeries, startMs, endMs, width]);

  // PanResponder.create(...) only runs once (useRef's initializer is
  // evaluated on mount only), so its callbacks would otherwise permanently
  // close over that first render's `width`/`start`/`end` (stale as soon as
  // the layout is measured or a different day is selected). Route through
  // refs that are kept fresh every render instead, so the handlers always
  // convert against the current geometry rather than the one from mount.
  const widthRef = useRef(width);
  widthRef.current = width;
  const geometryRef = useRef({ start, end, plotWidth: geometry.plotWidth });
  geometryRef.current = { start, end, plotWidth: geometry.plotWidth };

  // The reading is sticky: a tap or drag sets it, and it stays put after
  // release so there's time to actually read it, rather than reverting to
  // "now" the instant your finger lifts. Lifted to App.tsx (via onScrub) so
  // dragging this chart moves the crosshair on the other charts too.
  //
  // A touch that starts on the chart could just as easily be the start of a
  // vertical scroll through the page, so onMoveShouldSetPanResponder only
  // claims the gesture once it's clearly more horizontal than vertical —
  // otherwise scrolling past the chart reads as a scrub. Same test on
  // onShouldBlockNativeResponder/onPanResponderTerminationRequest: a
  // horizontal drag still refuses to hand off mid-gesture (see below), but
  // a gesture that turns vertical lets the ScrollView take over instead of
  // fighting it for the rest of the scroll.
  const isHorizontal = (g: { dx: number; dy: number }) => Math.abs(g.dx) > Math.abs(g.dy);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => isHorizontal(gesture),
      onPanResponderGrant: (evt) => {
        const w = widthRef.current;
        const { start, end, plotWidth } = geometryRef.current;
        const x = Math.min(Math.max(evt.nativeEvent.locationX, PADDING_LEFT), w - PADDING_X);
        onScrub?.(new Date(start.getTime() + ((x - PADDING_LEFT) / plotWidth) * (end.getTime() - start.getTime())));
      },
      onPanResponderMove: (evt, gesture) => {
        if (!isHorizontal(gesture)) return;
        const w = widthRef.current;
        const { start, end, plotWidth } = geometryRef.current;
        const x = Math.min(Math.max(evt.nativeEvent.locationX, PADDING_LEFT), w - PADDING_X);
        onScrub?.(new Date(start.getTime() + ((x - PADDING_LEFT) / plotWidth) * (end.getTime() - start.getTime())));
      },
      // Without this, the parent ScrollView can (and does) steal a
      // horizontal drag partway through, freezing the reading wherever the
      // handoff happened instead of tracking the finger to the end — but
      // only refuse the handoff for a genuine scrub; a gesture that's
      // turned vertical should go to the ScrollView instead.
      onPanResponderTerminationRequest: (_evt, gesture) => !isHorizontal(gesture),
      onShouldBlockNativeResponder: (_evt, gesture) => isHorizontal(gesture),
    }),
  ).current;

  if (geometry.empty) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No chart data available</Text>
      </View>
    );
  }

  const {
    waveHeights,
    windSpeeds,
    gustSpeeds,
    tideMinHeight,
    tideMaxHeight,
    waveMinHeight,
    waveMaxHeight,
    windMinSpeed,
    windMaxSpeed,
    toTideXY,
    tideGridLines,
    tidePath,
    tideAreaPath,
    wavePath,
    windPath,
    gustPath,
    plotWidth,
    plotHeight,
    totalMs,
    floorY,
    daylight,
  } = geometry;

  const currentX = PADDING_LEFT + ((now.getTime() - startMs) / totalMs) * plotWidth;
  // Clamped separately from currentX (which stays unclamped so the "now"
  // line only ever draws when it's truly inside the window): a `now`
  // before the window means nothing's elapsed yet (no fade), and a `now`
  // past it means the whole window is behind us (fade it all).
  const pastFadeEndX = Math.min(Math.max(currentX, PADDING_LEFT), width - PADDING_X);

  const isScrubbing = scrubTime !== null;
  const activeTime = scrubTime ?? new Date(Math.min(Math.max(now.getTime(), startMs), endMs));
  const activeTideHeight = series.heightAt(activeTime);
  const activeWaveHeight = waveSeries?.heightAt(activeTime) ?? null;
  const activeWindSpeed = windSeries?.speedAt(activeTime) ?? null;
  const activeGust = windSeries?.gustAt(activeTime) ?? null;
  const activeTidePoint = activeTideHeight !== null ? toTideXY(activeTime, activeTideHeight) : null;

  const hourTicks = hourTicksFor({ startHour, endHour });

  return (
    <View onLayout={onLayout}>
      <View style={styles.chartArea}>
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="tide-fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.3} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {daylight.night.map((band) => (
            <Rect
              key={band.key}
              x={band.x}
              y={PADDING_TOP}
              width={band.width}
              height={plotHeight}
              fill={colors.night}
            />
          ))}
          {daylight.marks.map((mark) => (
            <Line
              key={mark.key}
              x1={mark.x}
              y1={PADDING_TOP}
              x2={mark.x}
              y2={floorY}
              stroke={colors.textSecondary}
              strokeDasharray="2,3"
              strokeWidth={1}
              opacity={0.4}
            />
          ))}
          {tideGridLines.map((g) => (
            <Line
              key={g.value}
              x1={PADDING_LEFT}
              y1={g.y}
              x2={width - PADDING_X}
              y2={g.y}
              stroke={colors.cardBorder}
              strokeWidth={1}
            />
          ))}
          <Path d={tideAreaPath} fill="url(#tide-fill)" stroke="none" />
          <Path
            d={tidePath}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {wavePath && (
            <Path
              d={wavePath}
              fill="none"
              stroke={colors.rising}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.7}
            />
          )}
          {windPath && (
            <Path
              d={windPath}
              fill="none"
              stroke={colors.wind}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          )}
          {gustPath && (
            // Dashed, thinner and fainter than the sustained-speed line
            // rather than a distinct color — a gust reading is the same
            // wind signal at its peak, not a separate quantity (compare
            // TemperatureChart's real-vs-feels-like pair, which does get
            // two colors since those are genuinely different readings).
            <Path
              d={gustPath}
              fill="none"
              stroke={colors.wind}
              strokeWidth={1.5}
              strokeDasharray="3,3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.4}
            />
          )}
          {isToday && pastFadeEndX > PADDING_LEFT && (
            <Rect
              x={PADDING_LEFT}
              y={PADDING_TOP}
              width={pastFadeEndX - PADDING_LEFT}
              height={plotHeight}
              fill={colors.background}
              opacity={PAST_FADE_OPACITY}
            />
          )}
          {!isScrubbing && currentX >= PADDING_LEFT && currentX <= width - PADDING_X && (
            <Line
              x1={currentX}
              y1={PADDING_TOP}
              x2={currentX}
              y2={floorY}
              stroke={colors.textSecondary}
              strokeWidth={1.5}
              opacity={0.5}
            />
          )}
          {activeTidePoint && (
            <>
              <Line
                x1={activeTidePoint.x}
                y1={PADDING_TOP}
                x2={activeTidePoint.x}
                y2={floorY}
                stroke={colors.textSecondary}
                strokeDasharray={isScrubbing ? undefined : '3,4'}
                strokeWidth={1}
              />
              <Circle
                cx={activeTidePoint.x}
                cy={activeTidePoint.y}
                r={isScrubbing ? 6 : 5}
                fill={colors.textPrimary}
                stroke={colors.primary}
                strokeWidth={2}
              />
            </>
          )}
        </Svg>
        {activeTideHeight !== null && activeTidePoint && (
          <View
            pointerEvents="none"
            onLayout={onTooltipLayout}
            style={[
              styles.tooltip,
              { left: Math.min(Math.max(activeTidePoint.x - tooltipWidth / 2, 0), width - tooltipWidth) },
            ]}
          >
            <Text style={styles.tooltipText} numberOfLines={1}>
              {TideClock.format(activeTime, { hour: '2-digit', minute: '2-digit', hour12: false })} ·{' '}
              {activeTideHeight.toFixed(1)}m{activeWaveHeight !== null && ` / ${activeWaveHeight.toFixed(1)}w`}
              {activeWindSpeed !== null && ` / ${activeWindSpeed.toFixed(1)}s`}
              {activeGust !== null && ` / ${activeGust.toFixed(1)}g`}
            </Text>
          </View>
        )}
        {/* Plain overlay (not the SVG) receives touches, so locationX stays
            relative to this view instead of jumping between nested SVG
            elements as the finger crosses the path/line/circle underneath. */}
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
      </View>
      <View style={styles.axisRow}>
        {hourTicks.map((h) => (
          <Text key={h} style={styles.axisLabel}>
            {String(h).padStart(2, '0')}:00
          </Text>
        ))}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>
            Tide {tideMinHeight.toFixed(1)}–{tideMaxHeight.toFixed(1)}m
          </Text>
        </View>
        {waveHeights.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.rising }]} />
            <Text style={styles.legendText}>
              Wave {waveMinHeight.toFixed(1)}–{waveMaxHeight.toFixed(1)}m
            </Text>
          </View>
        )}
        {windSpeeds.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.wind }]} />
            <Text style={styles.legendText}>
              Wind {windMinSpeed.toFixed(1)}–{windMaxSpeed.toFixed(1)} mph
            </Text>
          </View>
        )}
        {gustSpeeds.length > 0 && (
          // A single peak figure, not a range — unlike wind speed, a "low"
          // gust reading is just a calm patch, not a number worth reporting.
          <View style={styles.legendItem}>
            <View style={[styles.legendDotOutline, { borderColor: colors.wind }]} />
            <Text style={styles.legendText}>Gust up to {Math.max(...gustSpeeds).toFixed(1)} mph</Text>
          </View>
        )}
      </View>
      {currentDirection !== null && (
        <View style={styles.currentRow}>
          {/* Ionicons' "navigate" glyph points due north at 0°, so rotating it
              by the current's own bearing (already "toward", not "from" —
              see SeaCurrentData) points it exactly where the water is heading. */}
          <Ionicons
            name="navigate"
            size={9}
            color={colors.textSecondary}
            style={{ transform: [{ rotate: `${currentDirection}deg` }] }}
          />
          <Text style={styles.currentText}>
            Current {compassPoint(currentDirection)}
            {currentVelocity !== null ? ` · ${currentVelocity.toFixed(1)}km/h` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    chartArea: { position: 'relative' },
    axisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_X,
      marginTop: 4,
    },
    axisLabel: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.mono },
    emptyState: { padding: 24, alignItems: 'center' },
    emptyText: { color: colors.textSecondary },
    tooltip: {
      position: 'absolute',
      top: 0,
      // No fixed width — sized to its own (single-line) text, not a box
      // wide enough for the longest possible reading.
      alignSelf: 'flex-start',
      // Always a dark bubble regardless of theme, so its text (also always
      // light) has guaranteed contrast without needing its own theme variant.
      // Kept translucent and light-weight rather than a solid, bold pill —
      // it's a passing reading, not something that should shout over the chart.
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 8,
      paddingVertical: 3,
      paddingHorizontal: 6,
    },
    tooltipText: { color: '#f5faff', fontSize: 12, fontWeight: '500' },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      columnGap: 12,
      rowGap: 2,
      marginTop: 3,
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_X,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    // Hollow, not filled — reads as the gust line's own dashed/faint style
    // in miniature, next to the solid wind dot beside it.
    legendDotOutline: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
    legendText: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '600',
      fontFamily: fonts.mono,
    },
    currentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginTop: 4,
    },
    currentText: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '500',
      fontFamily: fonts.mono,
      opacity: 0.8,
    },
  });
}
