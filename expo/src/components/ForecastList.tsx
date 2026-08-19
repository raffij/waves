import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { TideClock } from '../services/TideClock';
import type { ForecastDay } from '../services/TideForecast';
import type { WaveSeries } from '../services/WaveSeries';
import type { WindSeries } from '../services/WindSeries';
import type { Colors } from '../theme';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  waveSeries?: WaveSeries | null;
  windSeries?: WindSeries | null;
  selectedDateKey: string;
  onSelectDay: (dateKey: string) => void;
}

type Styles = ReturnType<typeof getStyles>;

function ExtremeChips({
  extremes,
  unitLabel,
  colors,
  styles,
}: {
  extremes: { high: number | null; low: number | null };
  unitLabel: string;
  colors: Colors;
  styles: Styles;
}) {
  if (extremes.high === null || extremes.low === null) return null;
  return (
    <>
      <View style={styles.chip}>
        <Text style={[styles.chipLabel, { color: colors.high }]}>H</Text>
        <Text style={styles.chipHeight}>{extremes.high.toFixed(1)}</Text>
        <Text style={[styles.chipTime, { fontSize: 10 }]}>{unitLabel}</Text>
      </View>
      <View style={styles.chip}>
        <Text style={[styles.chipLabel, { color: colors.low }]}>L</Text>
        <Text style={styles.chipHeight}>{extremes.low.toFixed(1)}</Text>
        <Text style={[styles.chipTime, { fontSize: 10 }]}>{unitLabel}</Text>
      </View>
    </>
  );
}

function ExtraExtremesRow({
  waveExtremes,
  windExtremes,
  colors,
  styles,
}: {
  waveExtremes: { high: number | null; low: number | null } | null;
  windExtremes: { high: number | null; low: number | null } | null;
  colors: Colors;
  styles: Styles;
}) {
  if (!waveExtremes && !windExtremes) return null;
  return (
    <View style={styles.extraRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {waveExtremes && <ExtremeChips extremes={waveExtremes} unitLabel="wave" colors={colors} styles={styles} />}
        {windExtremes && <ExtremeChips extremes={windExtremes} unitLabel="wind" colors={colors} styles={styles} />}
      </ScrollView>
    </View>
  );
}

function DayRow({
  day,
  isSelected,
  onSelect,
  waveSeries,
  windSeries,
  colors,
  styles,
}: {
  day: ForecastDay;
  isSelected: boolean;
  onSelect: () => void;
  waveSeries?: WaveSeries | null;
  windSeries?: WindSeries | null;
  colors: Colors;
  styles: Styles;
}) {
  const dayDate = TideClock.dateFromKey(day.dateKey);
  return (
    <Pressable onPress={onSelect} style={[styles.dayRow, !isSelected && styles.fadedRow]}>
      <Text style={styles.dayLabel}>{day.label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {day.extremes.map((extreme) => {
          const tint = extreme.type === 'high' ? colors.high : colors.low;
          const parsed = TideClock.parseISODate(extreme.localTime);
          const time = parsed ? TideClock.format(parsed, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
          return (
            <View key={extreme.localTime} style={styles.chip}>
              <Text style={[styles.chipLabel, { color: tint }]}>{extreme.type === 'high' ? 'H' : 'L'}</Text>
              <Text style={styles.chipHeight}>{extreme.height.toFixed(1)}</Text>
              <Text style={styles.chipTime}>{time}</Text>
            </View>
          );
        })}
      </ScrollView>
      <ExtraExtremesRow
        waveExtremes={waveSeries ? waveSeries.dailyExtremes(dayDate) : null}
        windExtremes={windSeries ? windSeries.dailyExtremes(dayDate) : null}
        colors={colors}
        styles={styles}
      />
    </Pressable>
  );
}

export function ForecastList({ yesterday, days, waveSeries, windSeries, selectedDateKey, onSelectDay }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {yesterday && (
        <DayRow
          key={yesterday.dateKey}
          day={yesterday}
          isSelected={yesterday.dateKey === selectedDateKey}
          onSelect={() => onSelectDay(yesterday.dateKey)}
          waveSeries={waveSeries}
          windSeries={windSeries}
          colors={colors}
          styles={styles}
        />
      )}
      {days.map((day) => (
        <DayRow
          key={day.dateKey}
          day={day}
          isSelected={day.dateKey === selectedDateKey}
          onSelect={() => onSelectDay(day.dateKey)}
          waveSeries={waveSeries}
          windSeries={windSeries}
          colors={colors}
          styles={styles}
        />
      ))}
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    container: { marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.cardBorder },
    dayRow: { marginBottom: 14 },
    fadedRow: { opacity: 0.45 },
    dayLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chipsRow: { flexDirection: 'row', gap: 18, paddingRight: 4 },
    chip: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 5,
    },
    chipLabel: { fontWeight: '700', fontSize: 12 },
    chipHeight: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
    chipTime: { color: colors.textSecondary, fontSize: 12 },
    extraRow: { marginTop: 6, opacity: 0.7 },
  });
}
