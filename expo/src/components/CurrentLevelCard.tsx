import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { CurrentLevel, Trend } from '../services/TideSeries';
import { colors } from '../theme';

interface Props {
  current: CurrentLevel | null;
  waveHeight: number | null;
  windSpeed: number | null;
  fetchedAt: Date | null;
}

const trendIcon: Record<Trend, keyof typeof Ionicons.glyphMap> = {
  rising: 'arrow-up-circle',
  falling: 'arrow-down-circle',
  steady: 'remove-circle',
  unknown: 'help-circle',
};

const trendColor: Record<Trend, string> = {
  rising: colors.rising,
  falling: colors.falling,
  steady: colors.textSecondary,
  unknown: colors.textSecondary,
};

export function CurrentLevelCard({ current, waveHeight, windSpeed, fetchedAt }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.label}>Hastings Pier</Text>
        {fetchedAt && (
          <Text style={styles.updated}>
            Updated{' '}
            {fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}
          </Text>
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
              <View style={styles.trendRow}>
                <Ionicons name={trendIcon[current.trend]} size={16} color={trendColor[current.trend]} />
                <Text style={[styles.trendText, { color: trendColor[current.trend] }]}>{current.trend}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.height}>—</Text>
          )}
        </View>
        {waveHeight !== null && (
          <View style={styles.waveSection}>
            <Text style={styles.sectionLabel}>Wave</Text>
            <Text style={styles.height}>
              {waveHeight.toFixed(1)}
              <Text style={styles.unit}>m</Text>
            </Text>
          </View>
        )}
        {windSpeed !== null && (
          <View style={styles.windSection}>
            <Text style={styles.sectionLabel}>Wind</Text>
            <Text style={styles.height}>
              {windSpeed.toFixed(1)}
              <Text style={styles.unit}>m/s</Text>
            </Text>
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
    justifyContent: 'space-between',
    marginTop: 2,
  },
  height: { color: colors.textPrimary, fontSize: 48, fontWeight: '700' },
  unit: { fontSize: 18, fontWeight: '500', color: colors.textSecondary },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  trendText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
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
