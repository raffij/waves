import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { TideSeries } from '../services/TideSeries';
import { TideClock } from '../services/TideClock';
import { colors } from '../theme';

interface Props {
  series: TideSeries;
  now: Date;
  startHour?: number;
  endHour?: number;
}

const WIDTH = 320;
const HEIGHT = 150;
const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 4;

export function TideChart({ series, now, startHour = 6, endHour = 22 }: Props) {
  const start = TideClock.londonDateAtHour(now, startHour);
  const end = TideClock.londonDateAtHour(now, endHour);
  const samples = series
    .samplesEvery(15, start, end)
    .filter((s): s is { time: Date; height: number } => s.height !== null);

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

  const plotWidth = WIDTH - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const totalMs = end.getTime() - start.getTime();

  const toXY = (time: Date, height: number) => {
    const x = PADDING_X + ((time.getTime() - start.getTime()) / totalMs) * plotWidth;
    const y = PADDING_TOP + (1 - (height - minHeight) / spread) * plotHeight;
    return { x, y };
  };

  const points = samples.map((s) => toXY(s.time, s.height));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const floorY = PADDING_TOP + plotHeight;
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${floorY} L ${points[0].x.toFixed(1)} ${floorY} Z`;

  const clampedNowMs = Math.min(Math.max(now.getTime(), start.getTime()), end.getTime());
  const nowHeight = series.heightAt(now);
  const nowPoint = nowHeight !== null ? toXY(new Date(clampedNowMs), nowHeight) : null;

  const hourTicks = [startHour, Math.round((startHour + endHour) / 2), endHour];

  return (
    <View>
      <Svg width={WIDTH} height={HEIGHT}>
        <Defs>
          <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.45} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#fill)" stroke="none" />
        <Path d={linePath} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {nowPoint && (
          <>
            <Line
              x1={nowPoint.x}
              y1={PADDING_TOP}
              x2={nowPoint.x}
              y2={floorY}
              stroke={colors.textSecondary}
              strokeDasharray="3,4"
              strokeWidth={1}
            />
            <Circle cx={nowPoint.x} cy={nowPoint.y} r={5} fill={colors.textPrimary} stroke={colors.primary} strokeWidth={2} />
          </>
        )}
      </Svg>
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
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: PADDING_X, marginTop: 4 },
  axisLabel: { color: colors.textSecondary, fontSize: 12 },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { color: colors.textSecondary },
});
