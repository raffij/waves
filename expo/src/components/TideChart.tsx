import { useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { TideClock } from '../services/TideClock';
import type { TideSeries } from '../services/TideSeries';
import type { WaveSeries } from '../services/WaveSeries';
import type { WindSeries } from '../services/WindSeries';
import { colors } from '../theme';

interface Props {
  series: TideSeries;
  waveSeries?: WaveSeries | null;
  windSeries?: WindSeries | null;
  now: Date;
  startHour?: number;
  endHour?: number;
}

const DEFAULT_WIDTH = 320;
const HEIGHT = 150;
const PADDING_X = 8;
const PADDING_LEFT = 30; // room for the tide (m) axis labels
const PADDING_TOP = 26; // extra room for the scrub tooltip
const PADDING_BOTTOM = 4;
const TOOLTIP_WIDTH = 170;

export function TideChart({ series, waveSeries, windSeries, now, startHour = 6, endHour = 22 }: Props) {
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

  // Wind scaling: different unit (m/s) with typical range 0-20
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

  const windPoints = windSamples.length > 0 ? windSamples.map((s) => toWindXY(s.time, s.speed)) : [];
  const windPath =
    windPoints.length > 0
      ? windPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      : '';

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
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.45} />
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
          {tideGridLines.map((g) => (
            <SvgText
              key={g.value}
              x={PADDING_LEFT - 4}
              y={g.y + 3.5}
              fontSize={10}
              fill={colors.textSecondary}
              textAnchor="end"
            >
              {g.value.toFixed(1)}m
            </SvgText>
          ))}
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
              Wind {windMinSpeed.toFixed(1)}–{windMaxSpeed.toFixed(1)} m/s
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartArea: { position: 'relative' },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: PADDING_LEFT,
    paddingRight: PADDING_X,
    marginTop: 4,
  },
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
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginTop: 8,
    paddingLeft: PADDING_LEFT,
    paddingRight: PADDING_X,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { color: colors.textSecondary, fontSize: 11 },
});
