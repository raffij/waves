import { Ionicons } from '@expo/vector-icons';
import { Anton_400Regular, useFonts as useAntonFonts } from '@expo-google-fonts/anton';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
  useFonts as useJetBrainsMonoFonts,
} from '@expo-google-fonts/jetbrains-mono';
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
import { DayInsights } from './src/components/DayInsights';
import { type ForecastDetail, ForecastList, type ForecastWindow } from './src/components/ForecastList';
import { PrecipitationChart } from './src/components/PrecipitationChart';
import { TemperatureChart } from './src/components/TemperatureChart';
import { TideChart } from './src/components/TideChart';
import type { Fonts } from './src/fonts';
import { useApiKey } from './src/hooks/useApiKey';
import { useAppStateFocusManager } from './src/hooks/useAppStateFocusManager';
import { useForecastData } from './src/hooks/useForecastData';
import { useLocation } from './src/hooks/useLocation';
import { type ThemeName, ThemeProvider, useTheme } from './src/hooks/useTheme';
import { useWidgetSync } from './src/hooks/useWidgetSync';
import { buildDayInsights } from './src/services/DayInsights';
import { TideClock } from './src/services/TideClock';
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

const themeToggleTarget: Record<ThemeName, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  dark: { icon: 'color-palette-outline', label: 'Poster mode' },
  poster: { icon: 'moon-outline', label: 'Dark mode' },
};

// Shows the target of the next tap, same as themeToggleTarget above.
const forecastDetailToggleTarget: Record<ForecastDetail, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  stats: { icon: 'document-text-outline', label: 'Forecast summary' },
  summary: { icon: 'stats-chart-outline', label: 'Forecast detail' },
};

const forecastWindowToggleTarget: Record<ForecastWindow, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  daytime: { icon: 'time-outline', label: 'Whole day' },
  wholeDay: { icon: 'sunny-outline', label: 'Daytime only' },
};

function AppContent() {
  useAppStateFocusManager();
  const { apiKey, saveKey, resetKey } = useApiKey();
  const { location, toggleLocation } = useLocation();
  useWidgetSync(apiKey, location);
  const {
    series,
    forecast,
    waveSeries,
    windSeries,
    precipitationSeries,
    daylightSeries,
    temperatureSeries,
    sunBrightnessSeries,
    fetchedAt,
    isFetching,
    error,
    refresh,
  } = useForecastData(apiKey, location);
  const [selectedDateKey, setSelectedDateKeyState] = useState<string | null>(null);
  // The scrub reading (dragged/tapped position, shared by all three charts
  // so they move together) is anchored to a specific day's window — it
  // doesn't mean anything once that window changes, so switching days
  // (including "back to today" via the current-conditions card) always
  // drops it back to live.
  const [scrubTime, setScrubTime] = useState<Date | null>(null);
  const selectDay = (dateKey: string | null) => {
    setSelectedDateKeyState(dateKey);
    setScrubTime(null);
  };
  // Per-day forecast rows read either as tide/wind/sun/light figures
  // ("stats") or a worded sentence like the main day-insights summary
  // ("summary") — a footer toggle, not a per-row choice, so the list stays
  // one consistent shape as you scan down it.
  const [forecastDetail, setForecastDetail] = useState<ForecastDetail>('stats');
  const toggleForecastDetail = () => setForecastDetail((mode) => (mode === 'stats' ? 'summary' : 'stats'));
  // Defaults to daytime hours only (06:00–20:00) — a day's tide/wind/sun
  // figures covering 3am aren't useful for deciding what to do with the
  // day, just for reading what happened while you were asleep.
  const [forecastWindow, setForecastWindow] = useState<ForecastWindow>('daytime');
  const toggleForecastWindow = () => setForecastWindow((mode) => (mode === 'daytime' ? 'wholeDay' : 'daytime'));
  const { colors, fonts, themeName, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);
  const statusBarStyle = themeName === 'dark' ? 'light-content' : 'dark-content';
  const [antonLoaded] = useAntonFonts({ Anton_400Regular });
  const [jetBrainsMonoLoaded] = useJetBrainsMonoFonts({ JetBrainsMono_400Regular, JetBrainsMono_700Bold });
  const fontsLoaded = antonLoaded && jetBrainsMonoLoaded;

  if (apiKey === undefined || location === undefined || !fontsLoaded) {
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
  const yesterday = forecast?.yesterday(now) ?? null;
  const days = forecast?.days(now, 5) ?? [];

  // Same time-of-day as right now, projected onto the selected day — so
  // "Tomorrow" shows tomorrow's predicted reading at this same hour, and
  // the chart centers on a comparable moment within that day's window.
  const isToday = activeDateKey === todayKey;
  const referenceDate = isToday ? now : TideClock.withTimeOfDay(TideClock.dateFromKey(activeDateKey), now);
  const selectedDayLabel = isToday
    ? null
    : ((yesterday?.dateKey === activeDateKey
        ? yesterday.label
        : days.find((d) => d.dateKey === activeDateKey)?.label) ?? null);

  const current = series?.currentLevel(referenceDate) ?? null;
  const waveHeight = waveSeries?.heightAt(referenceDate) ?? null;
  const waveTrend = waveSeries?.trend(referenceDate) ?? 'unknown';
  const windSpeed = windSeries?.speedAt(referenceDate) ?? null;
  const windTrend = windSeries?.trend(referenceDate) ?? 'unknown';

  // Plain expression, not useMemo — the hooks above sit before AppContent's
  // early returns and this doesn't, so it can't be a hook. Cheap anyway
  // (a handful of hourly lookups), and it matches how the derived values
  // above are computed each render.
  const insights = series
    ? buildDayInsights({
        windSeries,
        precipitationSeries,
        daylightSeries,
        temperatureSeries,
        sunBrightnessSeries,
        reference: referenceDate,
      })
    : null;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={statusBarStyle} />
      <SafeAreaView style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl tintColor={colors.primary} refreshing={isFetching} onRefresh={refresh} />}
        >
          <CurrentLevelCard
            current={current}
            waveHeight={waveHeight}
            waveTrend={waveTrend}
            windSpeed={windSpeed}
            windTrend={windTrend}
            fetchedAt={fetchedAt}
            dayLabel={selectedDayLabel}
            onPress={() => selectDay(null)}
          />

          {insights && (
            <View style={styles.section}>
              <DayInsights insights={insights} />
            </View>
          )}

          {series && (
            <View style={styles.section}>
              <TideChart
                series={series}
                waveSeries={waveSeries}
                windSeries={windSeries}
                daylightSeries={daylightSeries}
                now={referenceDate}
                isToday={isToday}
                scrubTime={scrubTime}
                onScrub={setScrubTime}
              />
            </View>
          )}

          {precipitationSeries && (
            <View style={styles.section}>
              <PrecipitationChart
                series={precipitationSeries}
                daylightSeries={daylightSeries}
                now={referenceDate}
                isToday={isToday}
                scrubTime={scrubTime}
                onScrub={setScrubTime}
              />
            </View>
          )}

          {temperatureSeries && (
            <View style={styles.section}>
              <TemperatureChart
                series={temperatureSeries}
                sunBrightnessSeries={sunBrightnessSeries}
                daylightSeries={daylightSeries}
                now={referenceDate}
                isToday={isToday}
                scrubTime={scrubTime}
                onScrub={setScrubTime}
              />
            </View>
          )}

          {error && <Text style={styles.error}>{error.message}</Text>}

          <View style={styles.section}>
            <ForecastList
              yesterday={yesterday}
              days={days}
              selectedDateKey={activeDateKey}
              onSelectDay={selectDay}
              now={now}
              detail={forecastDetail}
              window={forecastWindow}
              windSeries={windSeries}
              precipitationSeries={precipitationSeries}
              temperatureSeries={temperatureSeries}
              sunBrightnessSeries={sunBrightnessSeries}
              daylightSeries={daylightSeries}
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
              label={isFetching ? 'Refreshing…' : 'Refresh'}
              onPress={refresh}
              disabled={isFetching}
              colors={colors}
              styles={styles}
            />
            <FooterButton
              icon={themeToggleTarget[themeName].icon}
              label={themeToggleTarget[themeName].label}
              onPress={toggleTheme}
              colors={colors}
              styles={styles}
            />
            <FooterButton
              icon={forecastDetailToggleTarget[forecastDetail].icon}
              label={forecastDetailToggleTarget[forecastDetail].label}
              onPress={toggleForecastDetail}
              colors={colors}
              styles={styles}
            />
            <FooterButton
              icon={forecastWindowToggleTarget[forecastWindow].icon}
              label={forecastWindowToggleTarget[forecastWindow].label}
              onPress={toggleForecastWindow}
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

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: colors.background },
    loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    content: {
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 16,
    },
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
    locationText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.mono },
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
    footerButtonText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.mono },
  });
}
