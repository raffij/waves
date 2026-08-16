import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
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
import type { TideResponse } from './src/models/TideModels';
import { SecureKeyStore } from './src/services/SecureKeyStore';
import { TideAPIClient } from './src/services/TideAPIClient';
import { TideForecast } from './src/services/TideForecast';
import { TideSeries } from './src/services/TideSeries';
import { WaveAPIClient } from './src/services/WaveAPIClient';
import { WaveSeries } from './src/services/WaveSeries';
import { WindSeries } from './src/services/WindSeries';
import { colors } from './src/theme';

const STATION_ID = 'hastings_pier-hgp-gbr-cco';
const keyStore = new SecureKeyStore('wave-hastings-tidecheck-api-key');

export default function App() {
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined); // undefined = still loading
  const [data, setData] = useState<TideResponse | null>(null);
  const [waveData, setWaveData] = useState<any>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    keyStore.read().then(setApiKey);
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!apiKey) return;
      setLoading(true);
      setError(null);
      const tideClient = new TideAPIClient(STATION_ID, apiKey);
      const tideResult = force ? await tideClient.forceRefresh() : await tideClient.loadTideData();
      if (tideResult) {
        setData(tideResult.data);
        setFetchedAt(tideResult.fetchedAt);
      } else {
        setError('Could not load tide data. Check your connection or API key.');
      }

      const waveClient = new WaveAPIClient();
      const waveResult = force ? await waveClient.forceRefresh() : await waveClient.loadWaveData();
      if (waveResult) {
        setWaveData(waveResult.data);
      }

      setLoading(false);
    },
    [apiKey],
  );

  useEffect(() => {
    if (apiKey) load();
  }, [apiKey, load]);

  const handleSaveKey = async (key: string) => {
    await keyStore.write(key);
    setApiKey(key);
  };

  const handleResetKey = async () => {
    await keyStore.clear();
    setData(null);
    setFetchedAt(null);
    setApiKey(null);
  };

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
        <ApiKeyPrompt onSubmit={handleSaveKey} />
      </LinearGradient>
    );
  }

  const now = new Date();
  const series = data ? new TideSeries(data.timeSeries) : null;
  const waveSeries = waveData ? new WaveSeries(waveData) : null;
  const windSeries = waveData ? new WindSeries(waveData) : null;
  const forecast = data ? new TideForecast(data.extremes) : null;
  const current = series?.currentLevel(now) ?? null;
  const waveHeight = waveSeries?.heightAt(now) ?? null;
  const windSpeed = windSeries?.speedAt(now) ?? null;
  const yesterday = forecast?.yesterday(now) ?? null;
  const days = forecast?.days(now, 5) ?? [];

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
          <CurrentLevelCard current={current} waveHeight={waveHeight} windSpeed={windSpeed} fetchedAt={fetchedAt} />

          {series && (
            <View style={styles.chartCard}>
              <TideChart series={series} waveSeries={waveSeries} windSeries={windSeries} now={now} />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <ForecastList yesterday={yesterday} days={days} waveSeries={waveSeries} now={now} />

          <Pressable onPress={handleResetKey}>
            <Text style={styles.reset}>Reset API key</Text>
          </Pressable>
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
  reset: { color: colors.textSecondary, textAlign: 'center', marginTop: 24, fontSize: 12 },
});
