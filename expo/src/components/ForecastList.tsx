import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TideClock } from '../services/TideClock';
import type { ForecastDay } from '../services/TideForecast';
import type { WaveSeries } from '../services/WaveSeries';
import type { WindSeries } from '../services/WindSeries';
import { colors } from '../theme';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  waveSeries?: WaveSeries | null;
  windSeries?: WindSeries | null;
  now: Date;
}

function dateKeyToNoon(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function ExtremeChips({
  extremes,
  unitLabel,
}: {
  extremes: { high: number | null; low: number | null };
  unitLabel: string;
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
}: {
  waveExtremes: { high: number | null; low: number | null } | null;
  windExtremes: { high: number | null; low: number | null } | null;
}) {
  if (!waveExtremes && !windExtremes) return null;
  return (
    <View style={styles.extraRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {waveExtremes && <ExtremeChips extremes={waveExtremes} unitLabel="wave" />}
        {windExtremes && <ExtremeChips extremes={windExtremes} unitLabel="wind" />}
      </ScrollView>
    </View>
  );
}

export function ForecastList({ yesterday, days, waveSeries, windSeries, now }: Props) {
  return (
    <View style={styles.container}>
      {yesterday && (
        <View key={yesterday.dateKey} style={[styles.dayRow, styles.yesterdayRow]}>
          <Text style={styles.dayLabel}>{yesterday.label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {yesterday.extremes.map((extreme) => {
              const tint = extreme.type === 'high' ? colors.high : colors.low;
              const parsed = TideClock.parseISODate(extreme.localTime);
              const time = parsed
                ? TideClock.format(parsed, { hour: '2-digit', minute: '2-digit', hour12: false })
                : '';
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
            waveExtremes={waveSeries ? waveSeries.dailyExtremes(dateKeyToNoon(yesterday.dateKey)) : null}
            windExtremes={windSeries ? windSeries.dailyExtremes(dateKeyToNoon(yesterday.dateKey)) : null}
          />
        </View>
      )}
      {days.map((day) => (
        <View key={day.dateKey} style={styles.dayRow}>
          <Text style={styles.dayLabel}>{day.label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {day.extremes.map((extreme) => {
              const tint = extreme.type === 'high' ? colors.high : colors.low;
              const parsed = TideClock.parseISODate(extreme.localTime);
              const time = parsed
                ? TideClock.format(parsed, { hour: '2-digit', minute: '2-digit', hour12: false })
                : '';
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
            waveExtremes={waveSeries ? waveSeries.dailyExtremes(dateKeyToNoon(day.dateKey)) : null}
            windExtremes={windSeries ? windSeries.dailyExtremes(dateKeyToNoon(day.dateKey)) : null}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  dayRow: { marginBottom: 14 },
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
  yesterdayRow: { opacity: 0.5 },
  extraRow: { marginTop: 6, opacity: 0.7 },
});
