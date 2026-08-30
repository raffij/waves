import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';
import type { PrecipitationSeries } from '../services/PrecipitationSeries';
import { TideClock } from '../services/TideClock';
import type { Colors } from '../theme';

interface Props {
  series: PrecipitationSeries;
  now: Date;
  /** Whether `now` is the real current moment vs. a same-hour projection onto another day (see App.tsx). */
  isToday?: boolean;
  startHour?: number;
  endHour?: number;
}

const DEFAULT_WIDTH = 320;
const HEIGHT = 70;
const PADDING_X = 8;
const PADDING_TOP = 6;
const PADDING_BOTTOM = 4;
const BAR_GAP = 2;
// Below this, the tallest bar in the window would be too short to see —
// clamp the scale so a light drizzle hour still reads as a visible bar.
const MIN_SCALE_MM = 1;
// A dry hour renders as this instead of nothing, so an all-dry forecast
// reads as a full row of "measured: zero" ticks rather than a chart that
// failed to load with no data at all.
const BASELINE_HEIGHT = 3;
// Bars for hours already behind "now" render at this fraction of their
// normal opacity, so what's still ahead in the day reads at full strength
// and what's already passed visibly recedes. Matches TideChart's fade
// (recolors each bar directly rather than overlaying a translucent layer,
// since that barely registers against an already-faint dry-hour bar).
const PAST_OPACITY_SCALE = 0.5;

export function PrecipitationChart({ series, now, isToday = true, startHour = 6, endHour = 22 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const onLayout = (evt: LayoutChangeEvent) => {
    const measured = evt.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - width) > 0.5) setWidth(measured);
  };

  const start = TideClock.londonDateAtHour(now, startHour);
  const end = TideClock.londonDateAtHour(now, endHour);
  const bars = series.hourlyBars(start, end);

  const plotWidth = width - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const floorY = PADDING_TOP + plotHeight;
  const barWidth = bars.length > 0 ? plotWidth / bars.length - BAR_GAP : 0;

  const maxMm = Math.max(MIN_SCALE_MM, ...bars.map((b) => b.mm ?? 0));
  const total = bars.reduce((sum, b) => sum + (b.mm ?? 0), 0);

  // Searches the full series, not just this window, so it can point past
  // a dry evening at tomorrow morning's first shower. Anchored on the real
  // "now" only when viewing today — `now` for another day is a same-hour
  // projection (see App.tsx), not a real cutoff within that day, so a
  // future/past day is searched from its own 6am window start instead,
  // finding that day's first rain rather than skipping its early hours.
  const nextRainTime = series.nextRainAfter(isToday ? now : start);
  const nextRainLabel = nextRainTime
    ? ` · Next rain ${TideClock.format(
        nextRainTime,
        TideClock.dateKey(nextRainTime) === TideClock.dateKey(now)
          ? { hour: '2-digit', minute: '2-digit', hour12: false }
          : { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false },
      )}`
    : '';

  const totalMs = end.getTime() - start.getTime();
  const currentX = PADDING_X + ((now.getTime() - start.getTime()) / totalMs) * plotWidth;
  // Clamped: a `now` before the window means nothing's elapsed yet (no
  // fade), a `now` past it means the whole window is behind us (fade it all).
  const pastFadeEndX = Math.min(Math.max(currentX, PADDING_X), width - PADDING_X);

  const hourTicks = [startHour, Math.round((startHour + endHour) / 2), endHour];

  return (
    <View onLayout={onLayout}>
      <View style={styles.chartArea}>
        <Svg width={width} height={HEIGHT}>
          {bars.map((bar, i) => {
            const mm = bar.mm ?? 0;
            const barHeight = mm > 0 ? Math.max(BASELINE_HEIGHT + 1, (mm / maxMm) * plotHeight) : BASELINE_HEIGHT;
            const x = PADDING_X + i * (barWidth + BAR_GAP);
            const y = floorY - barHeight;
            const barCenterX = x + Math.max(barWidth, 1) / 2;
            const baseOpacity = mm > 0 ? 0.85 : 0.25;
            const opacity = barCenterX < pastFadeEndX ? baseOpacity * PAST_OPACITY_SCALE : baseOpacity;
            return (
              <Rect
                key={bar.time.toISOString()}
                x={x}
                y={y}
                width={Math.max(barWidth, 1)}
                height={barHeight}
                rx={1.5}
                fill={colors.precipitation}
                opacity={opacity}
              />
            );
          })}
        </Svg>
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
          <View style={[styles.legendDot, { backgroundColor: colors.precipitation }]} />
          <Text style={styles.legendText}>
            {(total > 0 ? `Rain ${total.toFixed(1)}mm total` : 'No rain expected') + nextRainLabel}
          </Text>
        </View>
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
      paddingLeft: PADDING_X,
      paddingRight: PADDING_X,
      marginTop: 4,
    },
    axisLabel: { color: colors.textSecondary, fontSize: 11 },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
      marginTop: 6,
      paddingLeft: PADDING_X,
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
