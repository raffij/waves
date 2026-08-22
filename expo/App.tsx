import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ApiKeyPrompt } from './src/components/ApiKeyPrompt';
import { CurrentLevelCard } from './src/components/CurrentLevelCard';
import { ForecastList } from './src/components/ForecastList';
import { PrecipitationChart } from './src/components/PrecipitationChart';
import { TideChart } from './src/components/TideChart';
import { useApiKey } from './src/hooks/useApiKey';
import { useForecastData } from './src/hooks/useForecastData';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { PrecipitationSeries } from './src/services/PrecipitationSeries';
import { TideClock } from './src/services/TideClock';
import { TideForecast } from './src/services/TideForecast';
import { TideSeries } from './src/services/TideSeries';
import { WaveSeries } from './src/services/WaveSeries';
import { WindSeries } from './src/services/WindSeries';
import type { Colors } from './src/theme';

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { apiKey, saveKey, resetKey } = useApiKey();
  const { data, waveData, windData, precipitationData, fetchedAt, loading, error, load } = useForecastData(apiKey);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const { colors, themeName, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const statusBarStyle = themeName === 'dark' ? 'light-content' : 'dark-content';

  if (apiKey === undefined) {
    return (
      <LinearGradient colors={[colors.background, colors.backgroundGradientEnd]} style={styles.flexCenter}>
        <ActivityIndicator color={colors.primary} />
      </LinearGradient>
    );
  }

  if (!apiKey) {
    return (
      <LinearGradient colors={[colors.background, colors.backgroundGradientEnd]} style={styles.flex}>
        <StatusBar barStyle={statusBarStyle} />
        <ApiKeyPrompt onSubmit={saveKey} />
      </LinearGradient>
    );
  }

  const now = new Date();
  const todayKey = TideClock.dateKey(now);
  const activeDateKey = selectedDateKey ?? todayKey;
  // The forecast list itself always spans the same fixed window (yesterday
  // through +5 days) anchored on the real "now" — selecting a day only
  // changes which one is highlighted and which data the top card/chart
  // reflect, not the list's own range.
  const series = data ? new TideSeries(data.timeSeries) : null;
  const waveSeries = waveData ? new WaveSeries(waveData) : null;
  const windSeries = windData ? new WindSeries(windData) : null;
  const precipitationSeries = precipitationData ? new PrecipitationSeries(precipitationData) : null;
  const forecast = data ? new TideForecast(data.extremes) : null;
  const yesterday = forecast?.yesterday(now) ?? null;
  const days = forecast?.days(now, 5) ?? [];

  // Same time-of-day as right now, projected onto the selected day — so
  // "Tomorrow" shows tomorrow's predicted reading at this same hour, and
  // the chart centers on a comparable moment within that day's window.
  const referenceDate =
    activeDateKey === todayKey ? now : TideClock.withTimeOfDay(TideClock.dateFromKey(activeDateKey), now);
  const selectedDayLabel =
    activeDateKey === todayKey
      ? null
      : ((yesterday?.dateKey === activeDateKey
          ? yesterday.label
          : days.find((d) => d.dateKey === activeDateKey)?.label) ?? null);

  const current = series?.currentLevel(referenceDate) ?? null;
  const waveHeight = waveSeries?.heightAt(referenceDate) ?? null;
  const waveTrend = waveSeries?.trend(referenceDate) ?? 'unknown';
  const windSpeed = windSeries?.speedAt(referenceDate) ?? null;
  const windTrend = windSeries?.trend(referenceDate) ?? 'unknown';

  return (
    <LinearGradient colors={[colors.background, colors.backgroundGradientEnd]} style={styles.flex}>
      <StatusBar barStyle={statusBarStyle} />
      <SafeAreaView style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl tintColor={colors.primary} refreshing={loading} onRefresh={() => load(true)} />
          }
        >
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.locationText}>Hastings Pier · East Sussex</Text>
          </View>

          <View style={styles.divider} />

          <CurrentLevelCard
            current={current}
            waveHeight={waveHeight}
            waveTrend={waveTrend}
            windSpeed={windSpeed}
            windTrend={windTrend}
            fetchedAt={fetchedAt}
            dayLabel={selectedDayLabel}
          />

          {series && (
            <>
              <View style={styles.divider} />
              <TideChart series={series} waveSeries={waveSeries} windSeries={windSeries} now={referenceDate} />
            </>
          )}

          {precipitationSeries && (
            <>
              <View style={styles.divider} />
              <PrecipitationChart series={precipitationSeries} now={referenceDate} />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.divider} />

          <ForecastList
            yesterday={yesterday}
            days={days}
            waveSeries={waveSeries}
            windSeries={windSeries}
            selectedDateKey={activeDateKey}
            onSelectDay={setSelectedDateKey}
          />

          <View style={styles.divider} />

          <View style={styles.footer}>
            <FooterButton
              icon="refresh-outline"
              label={loading ? 'Refreshing…' : 'Refresh'}
              onPress={() => load(true)}
              disabled={loading}
              colors={colors}
              styles={styles}
            />
            <FooterButton
              icon={themeName === 'dark' ? 'sunny-outline' : 'moon-outline'}
              label={themeName === 'dark' ? 'Light mode' : 'Dark mode'}
              onPress={toggleTheme}
              colors={colors}
              styles={styles}
            />
            <FooterButton icon="key-outline" label="Reset key" onPress={resetKey} colors={colors} styles={styles} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

type Styles = ReturnType<typeof getStyles>;

function FooterButton({
  icon,
  label,
  onPress,
  disabled,
  colors,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: Colors;
  styles: Styles;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.footerButton, (pressed || disabled) && styles.footerButtonPressed]}
    >
      <Ionicons name={icon} size={15} color={colors.textSecondary} />
      <Text style={styles.footerButtonText}>{label}</Text>
    </Pressable>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    flexCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 14, paddingBottom: 28 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    locationText: { color: colors.textSecondary, fontSize: 12 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.cardBorder, marginVertical: 18 },
    error: { color: colors.falling, marginTop: 16, textAlign: 'center' },
    footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 22 },
    footerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    footerButtonPressed: { opacity: 0.55 },
    footerButtonText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  });
}
