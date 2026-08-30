import { Ionicons } from '@expo/vector-icons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { useLocation } from './src/hooks/useLocation';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { PrecipitationSeries } from './src/services/PrecipitationSeries';
import { TideClock } from './src/services/TideClock';
import { TideForecast } from './src/services/TideForecast';
import { TideSeries } from './src/services/TideSeries';
import { WaveSeries } from './src/services/WaveSeries';
import { WindSeries } from './src/services/WindSeries';
import type { Colors } from './src/theme';

// TideCheck's free tier allows 50 requests/day, and TideAPIClient/
// WaveAPIClient already cache to AsyncStorage — so query retries are
// disabled by default to avoid burning through that budget on transient
// failures (loadTideData()/loadWaveData() already fall back to a stale
// cache on network errors).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppContent() {
  const { apiKey, saveKey, resetKey } = useApiKey();
  const { location, toggleLocation } = useLocation();
  const { data, waveData, windData, precipitationData, fetchedAt, loading, error, load } = useForecastData(
    apiKey,
    location,
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const { colors, themeName, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const statusBarStyle = themeName === 'dark' ? 'light-content' : 'dark-content';

  if (apiKey === undefined) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!apiKey) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle={statusBarStyle} />
        <ApiKeyPrompt onSubmit={saveKey} />
      </View>
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
    <View style={styles.screen}>
      <StatusBar barStyle={statusBarStyle} />
      <SafeAreaView style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl tintColor={colors.primary} refreshing={loading} onRefresh={() => load(true)} />
          }
        >
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
            <View style={styles.section}>
              <TideChart series={series} waveSeries={waveSeries} windSeries={windSeries} now={referenceDate} />
            </View>
          )}

          {precipitationSeries && (
            <View style={styles.section}>
              <PrecipitationChart series={precipitationSeries} now={referenceDate} />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.section}>
            <ForecastList
              yesterday={yesterday}
              days={days}
              selectedDateKey={activeDateKey}
              onSelectDay={setSelectedDateKey}
            />
          </View>

          <Pressable
            onPress={toggleLocation}
            style={({ pressed }) => [styles.locationRow, pressed && styles.locationRowPressed]}
          >
            <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.locationText}>
              {location.name} · {location.region}
            </Text>
            <Ionicons name="swap-horizontal-outline" size={12} color={colors.textSecondary} />
          </Pressable>

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
    </View>
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
    screen: { flex: 1, backgroundColor: colors.background },
    loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
    section: { marginTop: 20 },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginTop: 18,
      minHeight: 44,
    },
    locationRowPressed: { opacity: 0.5 },
    locationText: { color: colors.textSecondary, fontSize: 11 },
    error: { color: colors.falling, marginTop: 12, textAlign: 'center' },
    footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    footerButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    footerButtonPressed: { opacity: 0.5 },
    footerButtonText: { color: colors.textSecondary, fontSize: 12 },
  });
}
