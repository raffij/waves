import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, RefreshControl, StatusBar, ActivityIndicator, Text, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SecureKeyStore } from './src/services/SecureKeyStore';
import { TideAPIClient } from './src/services/TideAPIClient';
import { TideSeries } from './src/services/TideSeries';
import { TideForecast } from './src/services/TideForecast';
import { TideResponse } from './src/models/TideModels';
import { CurrentLevelCard } from './src/components/CurrentLevelCard';
import { TideChart } from './src/components/TideChart';
import { ForecastList } from './src/components/ForecastList';
import { ApiKeyPrompt } from './src/components/ApiKeyPrompt';
import { colors } from './src/theme';

const STATION_ID = 'hastings_pier-hgp-gbr-cco';
const keyStore = new SecureKeyStore('wave-hastings-tidecheck-api-key');

export default function App() {
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined); // undefined = still loading
  const [data, setData] = useState<TideResponse | null>(null);
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
      const client = new TideAPIClient(STATION_ID, apiKey);
      const result = force ? await client.forceRefresh() : await client.loadTideData();
      if (result) {
        setData(result.data);
        setFetchedAt(result.fetchedAt);
      } else {
        setError('Could not load tide data. Check your connection or API key.');
      }
      setLoading(false);
    },
    [apiKey]
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
  const forecast = data ? new TideForecast(data.extremes) : null;
  const current = series?.currentLevel(now) ?? null;
  const days = forecast?.days(now, 5) ?? [];

  return (
    <LinearGradient colors={[colors.background, colors.backgroundGradientEnd]} style={styles.flex}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl tintColor={colors.primary} refreshing={loading} onRefresh={() => load(true)} />}
        >
          <Text style={styles.title}>Hastings Tide</Text>

          <CurrentLevelCard current={current} fetchedAt={fetchedAt} />

          {series && (
            <View style={styles.chartCard}>
              <Text style={styles.chartHeading}>Today, 6am – 10pm</Text>
              <TideChart series={series} now={now} />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <ForecastList days={days} />

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
  content: { padding: 20, paddingBottom: 48 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800', marginBottom: 20 },
  chartCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
  },
  chartHeading: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, alignSelf: 'flex-start' },
  error: { color: colors.falling, marginTop: 16, textAlign: 'center' },
  reset: { color: colors.textSecondary, textAlign: 'center', marginTop: 24, fontSize: 12 },
});
