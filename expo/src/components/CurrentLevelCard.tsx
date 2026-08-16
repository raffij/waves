import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { CurrentLevel, Trend } from '../services/TideSeries';

interface Props {
  current: CurrentLevel | null;
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

export function CurrentLevelCard({ current, fetchedAt }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Hastings Pier</Text>
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
      {fetchedAt && (
        <Text style={styles.updated}>
          Updated {fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
  height: { color: colors.textPrimary, fontSize: 38, fontWeight: '700' },
  unit: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  trendText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  updated: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
});
