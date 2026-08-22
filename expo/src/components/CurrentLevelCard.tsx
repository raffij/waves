import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { CurrentLevel, Trend } from '../services/TideSeries';
import { type Colors, withAlpha } from '../theme';

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

function TrendBadge({ trend, colors, styles }: { trend: Trend; colors: Colors; styles: Styles }) {
  const trendColor: Record<Trend, string> = {
    rising: colors.rising,
    falling: colors.falling,
    steady: colors.textSecondary,
    unknown: colors.textSecondary,
  };
  const tint = trendColor[trend];
  return (
    <View style={[styles.trendBadge, { backgroundColor: withAlpha(tint, 0.16) }]}>
      <Ionicons name={trendIcon[trend]} size={11} color={tint} />
    </View>
  );
}

function Stat({
  icon,
  label,
  value,
  unit,
  trend,
  tint,
  colors,
  styles,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  unit: string;
  trend: Trend;
  tint: string;
  colors: Colors;
  styles: Styles;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}>
        <View style={[styles.statIconWrap, { backgroundColor: withAlpha(tint, 0.14) }]}>{icon}</View>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      {value !== null ? (
        <View style={styles.statValueRow}>
          <Text style={styles.statValue}>
            {value}
            <Text style={styles.statUnit}>{unit}</Text>
          </Text>
          <TrendBadge trend={trend} colors={colors} styles={styles} />
        </View>
      ) : (
        <Text style={styles.statValue}>—</Text>
      )}
    </View>
  );
}

export function CurrentLevelCard({ current, waveHeight, waveTrend, windSpeed, windTrend, fetchedAt, dayLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const updatedTime = fetchedAt
    ? fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Current conditions</Text>
        {dayLabel ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{dayLabel}</Text>
          </View>
        ) : (
          updatedTime && (
            <View style={styles.badge}>
              <View style={styles.liveDot} />
              <Text style={styles.badgeText}>Updated {updatedTime}</Text>
            </View>
          )
        )}
      </View>
      <View style={styles.contentRow}>
        <Stat
          icon={<Ionicons name="water" size={13} color={colors.primary} />}
          label="Tide"
          value={current ? current.height.toFixed(1) : null}
          unit="m"
          trend={current?.trend ?? 'unknown'}
          tint={colors.primary}
          colors={colors}
          styles={styles}
        />
        <Stat
          icon={<MaterialCommunityIcons name="waves" size={13} color={colors.rising} />}
          label="Wave"
          value={waveHeight !== null ? waveHeight.toFixed(1) : null}
          unit="m"
          trend={waveTrend}
          tint={colors.rising}
          colors={colors}
          styles={styles}
        />
        <Stat
          icon={<Feather name="wind" size={13} color={colors.wind} />}
          label="Wind"
          value={windSpeed !== null ? windSpeed.toFixed(1) : null}
          unit="mph"
          trend={windTrend}
          tint={colors.wind}
          colors={colors}
          styles={styles}
        />
      </View>
    </View>
  );
}

type Styles = ReturnType<typeof getStyles>;

function getStyles(colors: Colors) {
  return StyleSheet.create({
    card: {},
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: colors.card,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rising },
    badgeText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
    contentRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 12 },
    stat: { flex: 1 },
    statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    statIconWrap: {
      width: 22,
      height: 22,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    statValueRow: { flexDirection: 'row', alignItems: 'center' },
    statValue: {
      color: colors.textPrimary,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    },
    statUnit: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    trendBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
      marginBottom: 3,
    },
  });
}
