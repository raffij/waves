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

export function PrecipitationChart({ series, now, startHour = 6, endHour = 22 }: Props) {
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

  const hourTicks = [startHour, Math.round((startHour + endHour) / 2), endHour];

  return (
    <View onLayout={onLayout}>
      <View style={styles.chartArea}>
        <Svg width={width} height={HEIGHT}>
          {bars.map((bar, i) => {
            const mm = bar.mm ?? 0;
            const barHeight = mm > 0 ? Math.max(2, (mm / maxMm) * plotHeight) : 0;
            const x = PADDING_X + i * (barWidth + BAR_GAP);
            const y = floorY - barHeight;
            return (
              <Rect
                key={bar.time.toISOString()}
                x={x}
                y={y}
                width={Math.max(barWidth, 1)}
                height={barHeight}
                rx={1.5}
                fill={colors.precipitation}
                opacity={mm > 0 ? 0.85 : 0.15}
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
          <Text style={styles.legendText}>Rain {total.toFixed(1)}mm total</Text>
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
    axisLabel: { color: colors.textSecondary, fontSize: 12 },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 14,
      marginTop: 8,
      paddingLeft: PADDING_X,
      paddingRight: PADDING_X,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 7, height: 7, borderRadius: 3.5 },
    legendText: { color: colors.textSecondary, fontSize: 11 },
  });
}
