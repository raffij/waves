import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CurrentLevelCard } from './src/components/CurrentLevelCard';
import { DayInsights } from './src/components/DayInsights';
import { PrecipitationChart } from './src/components/PrecipitationChart';
import { TemperatureChart } from './src/components/TemperatureChart';
import { TideChart } from './src/components/TideChart';
import type { Fonts } from './src/fonts';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { buildDayInsights } from './src/services/DayInsights';
import { DaylightSeries } from './src/services/DaylightSeries';
import { PrecipitationSeries } from './src/services/PrecipitationSeries';
import { SunBrightnessSeries } from './src/services/SunBrightnessSeries';
import { TemperatureSeries } from './src/services/TemperatureSeries';
import { TideClock } from './src/services/TideClock';
import { TideSeries } from './src/services/TideSeries';
import { WaveSeries } from './src/services/WaveSeries';
import { WindSeries } from './src/services/WindSeries';
import type { Colors } from './src/theme';

// A local-only stand-in for a live day's forecast: every series the real
// screen renders, built from simple formulas instead of a TideCheck/
// Open-Meteo fetch. Anchored on today's real date, so the tense-sensitive
// bits (day insights, past-hour fade) behave the way they would live.
//
// Kept deliberately approximate — a sine-wave tide, a bell-curve sun — this
// is for eyeballing layout, colors and copy across the three themes, not for
// validating the science.
function buildSyntheticDay() {
  const today = TideClock.dateKey(new Date());
  const time: string[] = [];
  const height: number[] = [];
  const waveHeight: number[] = [];
  const windSpeed: number[] = [];
  const precipitation: number[] = [];
  const temperature: number[] = [];
  const apparentTemperature: number[] = [];
  const shortwaveRadiation: number[] = [];

  for (let h = 0; h < 24; h++) {
    time.push(`${today}T${String(h).padStart(2, '0')}:00`);

    // Roughly semi-diurnal (~12.4h period), 0.6–4.4m.
    height.push(Math.round((2.5 + 1.9 * Math.sin((h / 12.4) * 2 * Math.PI)) * 10) / 10);
    waveHeight.push(Math.round((0.6 + 0.5 * Math.sin((h / 12.4) * 2 * Math.PI + 1)) * 10) / 10);

    windSpeed.push(h < 12 ? 8 : 16 + (h > 16 ? 6 : 0));
    precipitation.push(h >= 8 && h <= 10 ? 1.4 : 0);

    const diurnal = 13 + 5 * Math.sin(((h - 7) / 24) * 2 * Math.PI * 1.4);
    temperature.push(Math.round(diurnal * 10) / 10);
    apparentTemperature.push(Math.round((diurnal - (h < 12 ? 2.5 : 0.5)) * 10) / 10);

    const sun = h >= 6 && h <= 20 ? Math.max(0, 480 * Math.sin(((h - 6) / 14) * Math.PI)) : 0;
    shortwaveRadiation.push(Math.round(sun));
  }

  return {
    tideSeries: new TideSeries(time.map((t, i) => ({ time: t, height: height[i] }))),
    waveSeries: new WaveSeries({ time, wave_height: waveHeight }),
    windSeries: new WindSeries({ time, wind_speed: windSpeed }),
    precipitationSeries: new PrecipitationSeries({ time, precipitation }),
    temperatureSeries: new TemperatureSeries({ time, temperature, apparent_temperature: apparentTemperature }),
    sunBrightnessSeries: new SunBrightnessSeries({ time, shortwave_radiation: shortwaveRadiation }),
    daylightSeries: new DaylightSeries({ time: [today], sunrise: [`${today}T06:15`], sunset: [`${today}T19:45`] }),
  };
}

function PreviewContent() {
  const { colors, fonts, themeName, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);
  const data = useMemo(buildSyntheticDay, []);
  const [now, setNow] = useState(() => new Date());
  const [scrubTime, setScrubTime] = useState<Date | null>(null);

  const insights = buildDayInsights({
    windSeries: data.windSeries,
    precipitationSeries: data.precipitationSeries,
    daylightSeries: data.daylightSeries,
    temperatureSeries: data.temperatureSeries,
    sunBrightnessSeries: data.sunBrightnessSeries,
    reference: now,
  });

  const current = data.tideSeries.currentLevel(now);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Preview harness · synthetic data, no network</Text>
            <Pressable style={styles.themeButton} onPress={toggleTheme}>
              <Text style={styles.themeButtonText}>{themeName}</Text>
            </Pressable>
          </View>

          <CurrentLevelCard
            current={current}
            waveHeight={data.waveSeries.heightAt(now)}
            waveTrend={data.waveSeries.trend(now)}
            windSpeed={data.windSeries.speedAt(now)}
            windTrend={data.windSeries.trend(now)}
            fetchedAt={now}
            dayLabel={null}
            onPress={() => {
              setNow(new Date());
              setScrubTime(null);
            }}
          />

          <View style={styles.section}>
            <DayInsights insights={insights} />
          </View>

          <View style={styles.section}>
            <TideChart
              series={data.tideSeries}
              waveSeries={data.waveSeries}
              windSeries={data.windSeries}
              daylightSeries={data.daylightSeries}
              now={now}
              isToday
              scrubTime={scrubTime}
              onScrub={setScrubTime}
            />
          </View>

          <View style={styles.section}>
            <PrecipitationChart
              series={data.precipitationSeries}
              daylightSeries={data.daylightSeries}
              now={now}
              isToday
              scrubTime={scrubTime}
              onScrub={setScrubTime}
            />
          </View>

          <View style={styles.section}>
            <TemperatureChart
              series={data.temperatureSeries}
              sunBrightnessSeries={data.sunBrightnessSeries}
              daylightSeries={data.daylightSeries}
              now={now}
              isToday
              scrubTime={scrubTime}
              onScrub={setScrubTime}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default function PreviewApp() {
  return (
    <ThemeProvider>
      <PreviewContent />
    </ThemeProvider>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: colors.background },
    content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    headerText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.mono, flexShrink: 1 },
    themeButton: {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: 8,
      paddingVertical: 4,
      paddingHorizontal: 10,
      marginLeft: 8,
    },
    themeButtonText: { color: colors.textPrimary, fontSize: 11, fontFamily: fonts.mono, textTransform: 'capitalize' },
    section: { marginTop: 20 },
  });
}
