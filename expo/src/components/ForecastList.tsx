import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { TideClock } from '../services/TideClock';
import type { ForecastDay } from '../services/TideForecast';
import type { WaveSeries } from '../services/WaveSeries';
import type { WindSeries } from '../services/WindSeries';
import { type Colors, withAlpha } from '../theme';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  waveSeries?: WaveSeries | null;
  windSeries?: WindSeries | null;
  selectedDateKey: string;
  onSelectDay: (dateKey: string) => void;
}

type Styles = ReturnType<typeof getStyles>;

function Chip({
  label,
  value,
  time,
  tint,
  styles,
}: {
  label: string;
  value: string;
  time: string;
  tint: string;
  styles: Styles;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(tint, 0.12) }]}>
      <Text style={[styles.chipLabel, { color: tint }]}>{label}</Text>
      <Text style={styles.chipHeight}>{value}</Text>
      {time ? <Text style={styles.chipTime}>{time}</Text> : null}
    </View>
  );
}

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
      <Chip label="H" value={extremes.high.toFixed(1)} time={unitLabel} tint={colors.high} styles={styles} />
      <Chip label="L" value={extremes.low.toFixed(1)} time={unitLabel} tint={colors.low} styles={styles} />
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
    <View style={[styles.extraRow, styles.chipsRow]}>
      {waveExtremes && <ExtremeChips extremes={waveExtremes} unitLabel="wave" colors={colors} styles={styles} />}
      {windExtremes && <ExtremeChips extremes={windExtremes} unitLabel="wind" colors={colors} styles={styles} />}
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
    <Pressable onPress={onSelect} style={[styles.dayRow, isSelected && styles.dayRowSelected]}>
      <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{day.label}</Text>
      <View style={styles.chipsRow}>
        {day.extremes.map((extreme) => {
          const tint = extreme.type === 'high' ? colors.high : colors.low;
          const parsed = TideClock.parseISODate(extreme.localTime);
          const time = parsed ? TideClock.format(parsed, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
          return (
            <Chip
              key={extreme.localTime}
              label={extreme.type === 'high' ? 'H' : 'L'}
              value={extreme.height.toFixed(1)}
              time={time}
              tint={tint}
              styles={styles}
            />
          );
        })}
      </View>
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
      <Text style={styles.sectionTitle}>Forecast</Text>
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
    container: { marginTop: 20 },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    dayRow: {
      marginBottom: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayRowSelected: {
      backgroundColor: colors.card,
      borderColor: withAlpha(colors.primary, 0.35),
    },
    dayLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    dayLabelSelected: { color: colors.primary },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 5,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 999,
    },
    chipLabel: { fontWeight: '700', fontSize: 12 },
    chipHeight: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
    chipTime: { color: colors.textSecondary, fontSize: 11 },
    extraRow: { marginTop: 8 },
  });
}
