import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { ForecastDay } from '../services/TideForecast';
import type { Colors } from '../theme';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  selectedDateKey: string;
  onSelectDay: (dateKey: string) => void;
}

type Styles = ReturnType<typeof getStyles>;

const COLUMNS = 6;
const GAP = 4;
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
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityLabel={`${day.label}, high ${high !== null ? high.toFixed(1) : 'unavailable'} metres, low ${low !== null ? low.toFixed(1) : 'unavailable'}`}
      accessibilityState={{ selected: isSelected }}
      style={({ pressed }) => [
        styles.tile,
        { width },
        isSelected && styles.tileSelected,
        pressed && styles.tilePressed,
      ]}
    >
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
  const tileWidth = Math.max(44, (width - GAP * (COLUMNS - 1)) / COLUMNS);

  const allDays = yesterday ? [yesterday, ...days] : days;

  return (
    <View onLayout={onLayout}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grid}>
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
      </ScrollView>
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', gap: GAP },
    tile: {
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      paddingHorizontal: 2,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tileSelected: {
      borderBottomColor: colors.primary,
    },
    tilePressed: { opacity: 0.55 },
    dayLabel: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '600',
      lineHeight: 13,
      textAlign: 'center',
    },
    dayLabelSelected: { color: colors.primary },
    extremes: { alignItems: 'center', gap: 1, marginTop: 4 },
    extremeText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  });
}
