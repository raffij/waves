import { useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';
import { TideClock } from '../services/TideClock';
import type { TideSeries } from '../services/TideSeries';
import type { WaveSeries } from '../services/WaveSeries';
import type { WindSeries } from '../services/WindSeries';
import type { Colors } from '../theme';

interface Props {
  series: TideSeries;
  waveSeries?: WaveSeries | null;
  windSeries?: WindSeries | null;
  now: Date;
  startHour?: number;
  endHour?: number;
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

export function TideChart({ series, waveSeries, windSeries, now, startHour = 6, endHour = 22 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const onLayout = (evt: LayoutChangeEvent) => {
    const measured = evt.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - width) > 0.5) setWidth(measured);
  };

  const start = TideClock.londonDateAtHour(now, startHour);
  const end = TideClock.londonDateAtHour(now, endHour);
  const tideSamples = series
    .samplesEvery(15, start, end)
    .filter((s): s is { time: Date; height: number } => s.height !== null);

  const waveSamples = waveSeries
    ? waveSeries.samplesEvery(15, start, end).filter((s): s is { time: Date; height: number } => s.height !== null)
    : [];

  const windSamples = windSeries
    ? windSeries.samplesEvery(15, start, end).filter((s): s is { time: Date; speed: number } => s.speed !== null)
    : [];

  const [scrubX, setScrubX] = useState<number | null>(null);

  const plotWidth = width - PADDING_LEFT - PADDING_X;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const totalMs = end.getTime() - start.getTime();

  // PanResponder.create(...) only runs once (useRef's initializer is
  // evaluated on mount only), so its callbacks would otherwise permanently
  // close over that first render's `width` (still DEFAULT_WIDTH, before
  // onLayout ever measured the real size). Route through a ref that's kept
  // fresh every render instead, so the handlers always clamp against the
  // current width rather than a stale one from mount.
  const widthRef = useRef(width);
  widthRef.current = width;

  // The reading is sticky: a tap or drag sets it, and it stays put after
  // release so there's time to actually read it, rather than reverting to
  // "now" the instant your finger lifts.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const w = widthRef.current;
        setScrubX(Math.min(Math.max(evt.nativeEvent.locationX, PADDING_LEFT), w - PADDING_X));
      },
      onPanResponderMove: (evt) => {
        const w = widthRef.current;
        setScrubX(Math.min(Math.max(evt.nativeEvent.locationX, PADDING_LEFT), w - PADDING_X));
      },
      // Without this, the parent ScrollView can (and does) steal the
      // gesture partway through a drag, freezing the reading wherever the
      // handoff happened instead of tracking the finger to the end.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  if (tideSamples.length < 2) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No chart data available</Text>
      </View>
    );
  }

  const tideHeights = tideSamples.map((s) => s.height);
  const tideMinHeight = Math.min(...tideHeights);
  const tideMaxHeight = Math.max(...tideHeights);
  const tideSpread = tideMaxHeight - tideMinHeight || 1;

  // Wave scaling: separate axis to show smaller wave heights clearly
  const waveHeights = waveSamples.map((s) => s.height);
  const waveMinHeight = waveHeights.length > 0 ? Math.min(...waveHeights) : 0;
  const waveMaxHeight = waveHeights.length > 0 ? Math.max(...waveHeights) : 1;
  const waveSpread = waveMaxHeight - waveMinHeight || 1;

  // Wind scaling: different unit (mph) with typical range 0-40
  const windSpeeds = windSamples.map((s) => s.speed);
  const windMinSpeed = windSpeeds.length > 0 ? Math.min(...windSpeeds) : 0;
  const windMaxSpeed = windSpeeds.length > 0 ? Math.max(...windSpeeds) : 1;
  const windSpread = windMaxSpeed - windMinSpeed || 1;

  const toTideXY = (time: Date, height: number) => {
    const x = PADDING_LEFT + ((time.getTime() - start.getTime()) / totalMs) * plotWidth;
    const y = PADDING_TOP + (1 - (height - tideMinHeight) / tideSpread) * plotHeight;
    return { x, y };
  };

  const toWaveXY = (time: Date, height: number) => {
    const x = PADDING_LEFT + ((time.getTime() - start.getTime()) / totalMs) * plotWidth;
    const y = PADDING_TOP + (1 - (height - waveMinHeight) / waveSpread) * plotHeight;
    return { x, y };
  };

  const toWindXY = (time: Date, speed: number) => {
    const x = PADDING_LEFT + ((time.getTime() - start.getTime()) / totalMs) * plotWidth;
    const y = PADDING_TOP + (1 - (speed - windMinSpeed) / windSpread) * plotHeight;
    return { x, y };
  };

  const tideMidHeight = (tideMinHeight + tideMaxHeight) / 2;
  const tideGridLines = [tideMaxHeight, tideMidHeight, tideMinHeight].map((value) => ({
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

  const currentX = PADDING_LEFT + ((now.getTime() - start.getTime()) / totalMs) * plotWidth;

  const isScrubbing = scrubX !== null;
  const activeTime =
    scrubX !== null
      ? new Date(start.getTime() + ((scrubX - PADDING_LEFT) / plotWidth) * totalMs)
      : new Date(Math.min(Math.max(now.getTime(), start.getTime()), end.getTime()));
  const activeTideHeight = series.heightAt(activeTime);
  const activeWaveHeight = waveSeries?.heightAt(activeTime) ?? null;
  const activeWindSpeed = windSeries?.speedAt(activeTime) ?? null;
  const activeTidePoint = activeTideHeight !== null ? toTideXY(activeTime, activeTideHeight) : null;

  const hourTicks = [startHour, Math.round((startHour + endHour) / 2), endHour];

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
            style={[
              styles.tooltip,
              { left: Math.min(Math.max(activeTidePoint.x - TOOLTIP_WIDTH / 2, 0), width - TOOLTIP_WIDTH) },
            ]}
          >
            <Text style={styles.tooltipText} numberOfLines={2}>
              {TideClock.format(activeTime, { hour: '2-digit', minute: '2-digit', hour12: false })} ·{' '}
              {activeTideHeight.toFixed(1)}m{activeWaveHeight !== null && ` / ${activeWaveHeight.toFixed(1)}w`}
              {activeWindSpeed !== null && ` / ${activeWindSpeed.toFixed(1)}s`}
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
      </View>
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    chartArea: { position: 'relative' },
    axisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_X,
      marginTop: 4,
    },
    axisLabel: { color: colors.textSecondary, fontSize: 11 },
    emptyState: { padding: 24, alignItems: 'center' },
    emptyText: { color: colors.textSecondary },
    tooltip: {
      position: 'absolute',
      top: 0,
      width: TOOLTIP_WIDTH,
      alignItems: 'center',
      // Always a dark bubble regardless of theme, so its text (also always
      // light) has guaranteed contrast without needing its own theme variant.
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderRadius: 8,
      paddingVertical: 3,
      paddingHorizontal: 6,
    },
    tooltipText: { color: '#f5faff', fontSize: 12, fontWeight: '600' },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
      marginTop: 6,
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_X,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      minHeight: 24,
      paddingVertical: 2,
    },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    legendText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  });
}
