import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { CurrentLevel, Trend } from '../services/TideSeries';
import { colors } from '../theme';

interface Props {
  current: CurrentLevel | null;
  waveHeight: number | null;
  waveTrend: Trend;
  windSpeed: number | null;
  windTrend: Trend;
  fetchedAt: Date | null;
  /** Set when viewing a non-live day (e.g. "Tomorrow"), shown in place of the "Updated" timestamp. */
  dayLabel?: string | null;
}

const trendIcon: Record<Trend, keyof typeof Ionicons.glyphMap> = {
  rising: 'arrow-up',
  falling: 'arrow-down',
  steady: 'remove',
  unknown: 'help',
};

const trendColor: Record<Trend, string> = {
  rising: colors.rising,
  falling: colors.falling,
  steady: colors.textSecondary,
  unknown: colors.textSecondary,
};

function TrendArrow({ trend }: { trend: Trend }) {
  return <Ionicons name={trendIcon[trend]} size={16} color={trendColor[trend]} style={styles.trendIcon} />;
}

export function CurrentLevelCard({ current, waveHeight, waveTrend, windSpeed, windTrend, fetchedAt, dayLabel }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.label}>Hastings Pier</Text>
        {dayLabel ? (
          <Text style={styles.updated}>{dayLabel}</Text>
        ) : (
          fetchedAt && (
            <Text style={styles.updated}>
              Updated{' '}
              {fetchedAt.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/London',
              })}
            </Text>
          )
        )}
      </View>
      <View style={styles.contentRow}>
        <View style={styles.tideSection}>
          <Text style={styles.sectionLabel}>Tide</Text>
          {current ? (
            <View style={styles.row}>
              <Text style={styles.height}>
                {current.height.toFixed(1)}
                <Text style={styles.unit}>m</Text>
              </Text>
              <TrendArrow trend={current.trend} />
            </View>
          ) : (
            <Text style={styles.height}>—</Text>
          )}
        </View>
        {waveHeight !== null && (
          <View style={styles.waveSection}>
            <Text style={styles.sectionLabel}>Wave</Text>
            <View style={styles.row}>
              <Text style={styles.height}>
                {waveHeight.toFixed(1)}
                <Text style={styles.unit}>m</Text>
              </Text>
              <TrendArrow trend={waveTrend} />
            </View>
          </View>
        )}
        {windSpeed !== null && (
          <View style={styles.windSection}>
            <Text style={styles.sectionLabel}>Wind</Text>
            <View style={styles.row}>
              <Text style={styles.height}>
                {windSpeed.toFixed(1)}
                <Text style={styles.unit}>m/s</Text>
              </Text>
              <TrendArrow trend={windTrend} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingTop: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  height: { color: colors.textPrimary, fontSize: 48, fontWeight: '700' },
  unit: { fontSize: 18, fontWeight: '500', color: colors.textSecondary },
  trendIcon: { marginBottom: 8, marginLeft: 2 },
  updated: { color: colors.textSecondary, fontSize: 11 },
  contentRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 16 },
  tideSection: { flex: 1 },
  waveSection: { flex: 1 },
  windSection: { flex: 1 },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
