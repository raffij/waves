import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
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
import { TideChart } from './src/components/TideChart';
import { useApiKey } from './src/hooks/useApiKey';
import { useForecastData } from './src/hooks/useForecastData';
import { TideClock } from './src/services/TideClock';
import { TideForecast } from './src/services/TideForecast';
import { TideSeries } from './src/services/TideSeries';
import { WaveSeries } from './src/services/WaveSeries';
import { WindSeries } from './src/services/WindSeries';
import { colors } from './src/theme';

export default function App() {
  const { apiKey, saveKey, resetKey } = useApiKey();
  const { data, waveData, windData, fetchedAt, loading, error, load } = useForecastData(apiKey);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

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
        <StatusBar barStyle="light-content" />
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
      <StatusBar barStyle="light-content" />
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
            <View style={styles.chartCard}>
              <TideChart series={series} waveSeries={waveSeries} windSeries={windSeries} now={referenceDate} />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <ForecastList
            yesterday={yesterday}
            days={days}
            waveSeries={waveSeries}
            windSeries={windSeries}
            selectedDateKey={activeDateKey}
            onSelectDay={setSelectedDateKey}
          />

          <View style={styles.footer}>
            <Pressable onPress={() => load(true)} disabled={loading}>
              <Text style={styles.reset}>{loading ? 'Refreshing…' : 'Force refresh'}</Text>
            </Pressable>
            <Pressable onPress={resetKey}>
              <Text style={styles.reset}>Reset API key</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 12, paddingBottom: 32 },
  chartCard: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  error: { color: colors.falling, marginTop: 16, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 24 },
  reset: { color: colors.textSecondary, textAlign: 'center', fontSize: 12 },
});
