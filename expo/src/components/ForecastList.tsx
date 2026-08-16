import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TideClock } from '../services/TideClock';
import type { ForecastDay } from '../services/TideForecast';
import type { WaveSeries } from '../services/WaveSeries';
import { colors } from '../theme';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  waveSeries?: WaveSeries | null;
  now: Date;
}

export function ForecastList({ yesterday, days, waveSeries, now }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>5-Day Forecast</Text>
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
          {waveSeries && (
            <View style={styles.waveRow}>
              {(() => {
                const [year, month, dayNum] = day.dateKey.split('-').map(Number);
                const dayDate = new Date(year, month - 1, dayNum, 12, 0, 0);
                const extremes = waveSeries.dailyExtremes(dayDate);
                if (extremes.high === null || extremes.low === null) return null;
                return (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    <View style={styles.chip}>
                      <Text style={[styles.chipLabel, { color: colors.high }]}>H</Text>
                      <Text style={styles.chipHeight}>{extremes.high.toFixed(1)}</Text>
                      <Text style={[styles.chipTime, { fontSize: 10 }]}>wave</Text>
                    </View>
                    <View style={styles.chip}>
                      <Text style={[styles.chipLabel, { color: colors.low }]}>L</Text>
                      <Text style={styles.chipHeight}>{extremes.low.toFixed(1)}</Text>
                      <Text style={[styles.chipTime, { fontSize: 10 }]}>wave</Text>
                    </View>
                  </ScrollView>
                );
              })()}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 12 },
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
  waveRow: { marginTop: 6, opacity: 0.7 },
});
