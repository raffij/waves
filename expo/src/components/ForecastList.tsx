import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { ForecastDay } from '../services/TideForecast';
import { type Colors, withAlpha } from '../theme';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  selectedDateKey: string;
  onSelectDay: (dateKey: string) => void;
}

type Styles = ReturnType<typeof getStyles>;

const COLUMNS = 4;
const GAP = 8;
const DEFAULT_WIDTH = 320;

function dayExtremes(day: ForecastDay): { high: number | null; low: number | null } {
  const highs = day.extremes.filter((e) => e.type === 'high').map((e) => e.height);
  const lows = day.extremes.filter((e) => e.type === 'low').map((e) => e.height);
  return {
    high: highs.length > 0 ? Math.max(...highs) : null,
    low: lows.length > 0 ? Math.min(...lows) : null,
  };
}

// "Today" / "Tomorrow" / "Yesterday" already fit on one line; a dated label
// like "Wed 20 Aug" is split onto two so it stays readable at tile width.
function labelLines(label: string): string[] {
  const [weekday, ...rest] = label.split(' ');
  return rest.length > 0 ? [weekday, rest.join(' ')] : [weekday];
}

function DayTile({
  day,
  isSelected,
  onSelect,
  width,
  colors,
  styles,
}: {
  day: ForecastDay;
  isSelected: boolean;
  onSelect: () => void;
  width: number;
  colors: Colors;
  styles: Styles;
}) {
  const { high, low } = dayExtremes(day);
  return (
    <Pressable onPress={onSelect} style={[styles.tile, { width }, isSelected && styles.tileSelected]}>
      {labelLines(day.label).map((line) => (
        <Text key={line} style={[styles.dayLabel, isSelected && styles.dayLabelSelected]} numberOfLines={1}>
          {line}
        </Text>
      ))}
      <View style={styles.extremes}>
        <Text style={[styles.extremeText, { color: colors.high }]}>H {high !== null ? high.toFixed(1) : '—'}</Text>
        <Text style={[styles.extremeText, { color: colors.low }]}>L {low !== null ? low.toFixed(1) : '—'}</Text>
      </View>
    </Pressable>
  );
}

export function ForecastList({ yesterday, days, selectedDateKey, onSelectDay }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const onLayout = (evt: LayoutChangeEvent) => {
    const measured = evt.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - width) > 0.5) setWidth(measured);
  };
  const tileWidth = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const allDays = yesterday ? [yesterday, ...days] : days;

  return (
    <View style={styles.grid} onLayout={onLayout}>
      {allDays.map((day) => (
        <DayTile
          key={day.dateKey}
          day={day}
          isSelected={day.dateKey === selectedDateKey}
          onSelect={() => onSelectDay(day.dateKey)}
          width={tileWidth}
          colors={colors}
          styles={styles}
        />
      ))}
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    tile: {
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    tileSelected: {
      backgroundColor: colors.card,
      borderColor: withAlpha(colors.primary, 0.35),
    },
    dayLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    dayLabelSelected: { color: colors.primary },
    extremes: { alignItems: 'center', gap: 2, marginTop: 6 },
    extremeText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  });
}
