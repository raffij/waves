import { useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { TideClock } from '../services/TideClock';
import type { TideSeries } from '../services/TideSeries';
import { colors } from '../theme';

interface Props {
  series: TideSeries;
  now: Date;
  startHour?: number;
  endHour?: number;
}

const DEFAULT_WIDTH = 320;
const HEIGHT = 150;
const PADDING_X = 8;
const PADDING_TOP = 26; // extra room for the scrub tooltip
const PADDING_BOTTOM = 4;
const TOOLTIP_WIDTH = 108;

export function TideChart({ series, now, startHour = 6, endHour = 22 }: Props) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const onLayout = (evt: LayoutChangeEvent) => {
    const measured = evt.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - width) > 0.5) setWidth(measured);
  };

  const start = TideClock.londonDateAtHour(now, startHour);
  const end = TideClock.londonDateAtHour(now, endHour);
  const samples = series
    .samplesEvery(15, start, end)
    .filter((s): s is { time: Date; height: number } => s.height !== null);

  const [scrubX, setScrubX] = useState<number | null>(null);

  const plotWidth = width - PADDING_X * 2;
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
        setScrubX(Math.min(Math.max(evt.nativeEvent.locationX, PADDING_X), w - PADDING_X));
      },
      onPanResponderMove: (evt) => {
        const w = widthRef.current;
        setScrubX(Math.min(Math.max(evt.nativeEvent.locationX, PADDING_X), w - PADDING_X));
      },
      // Without this, the parent ScrollView can (and does) steal the
      // gesture partway through a drag, freezing the reading wherever the
      // handoff happened instead of tracking the finger to the end.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  if (samples.length < 2) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No chart data available</Text>
      </View>
    );
  }

  const heights = samples.map((s) => s.height);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const spread = maxHeight - minHeight || 1;

  const toXY = (time: Date, height: number) => {
    const x = PADDING_X + ((time.getTime() - start.getTime()) / totalMs) * plotWidth;
    const y = PADDING_TOP + (1 - (height - minHeight) / spread) * plotHeight;
    return { x, y };
  };

  const points = samples.map((s) => toXY(s.time, s.height));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const floorY = PADDING_TOP + plotHeight;
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${floorY} L ${points[0].x.toFixed(1)} ${floorY} Z`;

  const isScrubbing = scrubX !== null;
  const activeTime =
    scrubX !== null
      ? new Date(start.getTime() + ((scrubX - PADDING_X) / plotWidth) * totalMs)
      : new Date(Math.min(Math.max(now.getTime(), start.getTime()), end.getTime()));
  const activeHeight = series.heightAt(activeTime);
  const activePoint = activeHeight !== null ? toXY(activeTime, activeHeight) : null;

  const hourTicks = [startHour, Math.round((startHour + endHour) / 2), endHour];

  return (
    <View onLayout={onLayout}>
      <View style={styles.chartArea}>
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.45} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={areaPath} fill="url(#fill)" stroke="none" />
          <Path
            d={linePath}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {activePoint && (
            <>
              <Line
                x1={activePoint.x}
                y1={PADDING_TOP}
                x2={activePoint.x}
                y2={floorY}
                stroke={colors.textSecondary}
                strokeDasharray={isScrubbing ? undefined : '3,4'}
                strokeWidth={1}
              />
              <Circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={isScrubbing ? 6 : 5}
                fill={colors.textPrimary}
                stroke={colors.primary}
                strokeWidth={2}
              />
            </>
          )}
        </Svg>
        {activeHeight !== null && activePoint && (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              { left: Math.min(Math.max(activePoint.x - TOOLTIP_WIDTH / 2, 0), width - TOOLTIP_WIDTH) },
            ]}
          >
            <Text style={styles.tooltipText} numberOfLines={1}>
              {TideClock.format(activeTime, { hour: '2-digit', minute: '2-digit', hour12: false })} ·{' '}
              {activeHeight.toFixed(1)}m
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
    </View>
  );
}

const styles = StyleSheet.create({
  chartArea: { position: 'relative' },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: PADDING_X, marginTop: 4 },
  axisLabel: { color: colors.textSecondary, fontSize: 12 },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { color: colors.textSecondary },
  tooltip: {
    position: 'absolute',
    top: 0,
    width: TOOLTIP_WIDTH,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  tooltipText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
});
