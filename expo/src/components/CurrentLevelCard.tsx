import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { Location } from '../models/Location';
import type { CurrentLevel, Trend } from '../services/TideSeries';
import { compassPointFor } from '../services/WindSeries';
import type { Colors } from '../theme';

interface Props {
  current: CurrentLevel | null;
  waveHeight: number | null;
  waveTrend: Trend;
  windSpeed: number | null;
  windDirection: number | null;
  windTrend: Trend;
  seaTemp: number | null;
  fetchedAt: Date | null;
  /** Set when viewing a non-live day (e.g. "Tomorrow"), shown in place of the "Updated" timestamp. */
  dayLabel?: string | null;
  /** Jumps back to today/now — tapping the "Updated"/day badge doubles as a "back to live" control once another day is selected. */
  onPressUpdated?: () => void;
  location: Location;
  onPressLocation: () => void;
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
    <View style={styles.trendBadge}>
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
  colors,
  styles,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  unit: string;
  // Omitted for readings with no notion of "rising/falling" (e.g. sea
  // temperature) — the badge is skipped entirely rather than shown as
  // "unknown", which would otherwise look like a transient loading state.
  trend?: Trend;
  colors: Colors;
  styles: Styles;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}>
        <View style={styles.statIconWrap}>{icon}</View>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        {trend && <TrendBadge trend={trend} colors={colors} styles={styles} />}
      </View>
      <Text style={styles.statValue}>
        {value !== null ? (
          <>
            {value}
            <Text style={styles.statUnit}>{unit}</Text>
          </>
        ) : (
          '—'
        )}
      </Text>
    </View>
  );
}

export function CurrentLevelCard({
  current,
  waveHeight,
  waveTrend,
  windSpeed,
  windDirection,
  windTrend,
  seaTemp,
  fetchedAt,
  dayLabel,
  onPressUpdated,
  location,
  onPressLocation,
}: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);

  const updatedTime = fetchedAt
    ? fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onPressLocation}
          style={({ pressed }) => [styles.locationButton, pressed && styles.pressedFaint]}
          hitSlop={6}
        >
          <Ionicons name="location-outline" size={11} color={colors.textSecondary} />
          <Text style={styles.locationTitle} numberOfLines={1}>
            {location.name} · {location.region}
          </Text>
          <Ionicons name="swap-horizontal-outline" size={11} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={onPressUpdated}
          disabled={!onPressUpdated}
          style={({ pressed }) => [styles.badgeButton, pressed && onPressUpdated && styles.pressedFaint]}
          hitSlop={6}
        >
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
        </Pressable>
      </View>
      <View style={styles.contentRow}>
        <Stat
          icon={<Ionicons name="water" size={13} color={colors.primary} />}
          label="Tide"
          value={current ? current.height.toFixed(1) : null}
          unit="m"
          trend={current?.trend ?? 'unknown'}
          colors={colors}
          styles={styles}
        />
        <Stat
          icon={<MaterialCommunityIcons name="waves" size={13} color={colors.rising} />}
          label="Wave"
          value={waveHeight !== null ? waveHeight.toFixed(1) : null}
          unit="m"
          trend={waveTrend}
          colors={colors}
          styles={styles}
        />
        <Stat
          icon={<Feather name="wind" size={13} color={colors.wind} />}
          label={windDirection !== null ? `Wi (${compassPointFor(windDirection)})` : 'Wind'}
          value={windSpeed !== null ? windSpeed.toFixed(1) : null}
          unit="mph"
          trend={windTrend}
          colors={colors}
          styles={styles}
        />
        <Stat
          icon={<Ionicons name="thermometer-outline" size={13} color={colors.temperature} />}
          label="Sea"
          value={seaTemp !== null ? seaTemp.toFixed(1) : null}
          unit="°C"
          colors={colors}
          styles={styles}
        />
      </View>
    </View>
  );
}

type Styles = ReturnType<typeof getStyles>;

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    card: {},
    pressedFaint: { opacity: 0.5 },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    // Deliberately understated — this is a location switcher, not a
    // headline, so it reads at the same weight as the "Updated" badge
    // across from it rather than announcing itself as the card's title.
    locationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexShrink: 1,
      minHeight: 32,
    },
    locationTitle: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      fontFamily: fonts.mono,
      flexShrink: 1,
    },
    badgeButton: { minHeight: 32, justifyContent: 'center' },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rising },
    badgeText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: fonts.mono },
    contentRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 8 },
    stat: { flex: 1 },
    statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
    statIconWrap: {
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statLabel: {
      flexShrink: 1,
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      fontFamily: fonts.mono,
    },
    statValue: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'],
      fontFamily: fonts.monoBold,
    },
    statUnit: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    trendBadge: {
      width: 12,
      height: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
