import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CurrentLevelCard } from './src/components/CurrentLevelCard';
import { DayInsights } from './src/components/DayInsights';
import { type ForecastDetail, ForecastList } from './src/components/ForecastList';
import { PrecipitationChart } from './src/components/PrecipitationChart';
import { TemperatureChart } from './src/components/TemperatureChart';
import { TideChart } from './src/components/TideChart';
import type { Fonts } from './src/fonts';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { DEFAULT_LOCATION } from './src/models/Location';
import type { Extreme } from './src/models/TideModels';
import { CloudCoverSeries } from './src/services/CloudCoverSeries';
import { buildDayInsights } from './src/services/dayInsights';
import { DaylightSeries } from './src/services/DaylightSeries';
import { type ForecastWindow, hoursFor } from './src/services/DayWindow';
import { PrecipitationSeries } from './src/services/PrecipitationSeries';
import { SeaCurrentSeries } from './src/services/SeaCurrentSeries';
import { SeaTemperatureSeries } from './src/services/SeaTemperatureSeries';
import { SunBrightnessSeries } from './src/services/SunBrightnessSeries';
import { TemperatureSeries } from './src/services/TemperatureSeries';
import { TideClock } from './src/services/TideClock';
import { TideForecast } from './src/services/TideForecast';
import { TideSeries } from './src/services/TideSeries';
import { WaveSeries } from './src/services/WaveSeries';
import { WindSeries } from './src/services/WindSeries';
import type { Colors } from './src/theme';

// A local-only stand-in for a live forecast: every series the real screen
// renders, built from simple formulas instead of a TideCheck/Open-Meteo
// fetch, spanning yesterday through +5 days so the forecast list has
// something to page through. Anchored on today's real date, so the
// tense-sensitive bits (day insights, past-hour fade) behave the way they
// would live.
//
// Kept deliberately approximate — a sine-wave tide, a bell-curve sun — this
// is for eyeballing layout, colors and copy across the three themes, not for
// validating the science. One day (tomorrow) is seeded rainier than the
// rest so the forecast list's rain icon/legend has something to show.
function buildSyntheticForecast() {
  const today = new Date();
  const dayOffsets = [-1, 0, 1, 2, 3, 4, 5];

  const time: string[] = [];
  const height: number[] = [];
  const waveHeight: number[] = [];
  const windSpeed: number[] = [];
  const windDirection: number[] = [];
  const windGusts: number[] = [];
  const precipitation: number[] = [];
  const temperature: number[] = [];
  const apparentTemperature: number[] = [];
  const shortwaveRadiation: number[] = [];
  const cloudCover: number[] = [];
  const seaTemperature: number[] = [];
  const oceanCurrentDirection: number[] = [];
  const oceanCurrentVelocity: number[] = [];
  const extremes: Extreme[] = [];
  const dayKeys: string[] = [];
  const sunriseTimes: string[] = [];
  const sunsetTimes: string[] = [];

  for (const dayOffset of dayOffsets) {
    const day = new Date(today.getTime() + dayOffset * 86_400_000);
    const dateKey = TideClock.dateKey(day);

    for (let h = 0; h < 24; h++) {
      time.push(`${dateKey}T${String(h).padStart(2, '0')}:00`);

      // Roughly semi-diurnal (~12.4h period), 0.6–4.4m, phase-shifted a bit
      // per day like a real tide's daily lag.
      const phase = dayOffset * 0.8;
      height.push(Math.round((2.5 + 1.9 * Math.sin((h / 12.4) * 2 * Math.PI + phase)) * 10) / 10);
      waveHeight.push(Math.round((0.6 + 0.5 * Math.sin((h / 12.4) * 2 * Math.PI + 1 + phase)) * 10) / 10);

      windSpeed.push((h < 12 ? 8 : 16 + (h > 16 ? 6 : 0)) + dayOffset);
      // Veers from southwest in the morning toward north by evening, shifted
      // a little per day — enough swing to exercise the day-insights
      // backing/veering phrase, not just the "from the <point>" steady case.
      windDirection.push(Math.round((215 + 200 * (h / 23) + dayOffset * 10) % 360));
      // Gust runs a fixed margin above sustained speed each hour, sized per
      // day so roughly half the days clear DayInsights' WIND_GUST_EXCESS_MPH
      // threshold (gust worth naming in the sentence) and half don't (gust
      // stays unremarkable) — exercises both branches of windClause's gust
      // clause, and gives TideChart's gust line something to visibly diverge
      // from the sustained-speed line on.
      windGusts.push(windSpeed[windSpeed.length - 1] + (dayOffset % 2 === 0 ? 13 : 4));
      precipitation.push(dayOffset === 1 && h >= 8 && h <= 14 ? 2.2 : dayOffset === 0 && h >= 8 && h <= 10 ? 1.4 : 0);

      const diurnal = 13 + 5 * Math.sin(((h - 7) / 24) * 2 * Math.PI * 1.4) - dayOffset * 0.4;
      temperature.push(Math.round(diurnal * 10) / 10);
      apparentTemperature.push(Math.round((diurnal - (h < 12 ? 2.5 : 0.5)) * 10) / 10);

      const sun = h >= 6 && h <= 20 ? Math.max(0, 480 * Math.sin(((h - 6) / 14) * Math.PI)) : 0;
      shortwaveRadiation.push(Math.round(sun));

      // Varies independently of brightness (clearing through the morning,
      // cloudier as each day offset increases) so the preview can show
      // brightness and cloud cover actually disagreeing sometimes — a
      // bright-but-overcast hour, or a clear-but-dim one.
      const cloud = 55 - 35 * Math.sin(((h - 6) / 14) * Math.PI) + dayOffset * 6;
      cloudCover.push(Math.max(0, Math.min(100, Math.round(cloud))));

      // Sea temperature drifts far more slowly than air temperature — a
      // gentle day-to-day rise rather than a diurnal swing.
      seaTemperature.push(Math.round((15 + dayOffset * 0.2) * 10) / 10);
      // A tidal current: bearing sweeps a full circle roughly every 12.4h
      // (rotating with the tide, like a real coastal current), speed varies
      // with it so the preview shows both idle slack water and a running tide.
      const tidalPhase = (h / 12.4) * 2 * Math.PI + dayOffset * 0.8;
      const bearingDeg = tidalPhase * (180 / Math.PI);
      oceanCurrentDirection.push(Math.round(((bearingDeg % 360) + 360) % 360));
      oceanCurrentVelocity.push(Math.round(Math.abs(1.4 * Math.sin(tidalPhase)) * 10) / 10);
    }

    extremes.push(
      // Deliberately mixed — the overnight high/low are the day's biggest
      // swing, the daytime pair more modest — so the forecast list's
      // daytime/whole-day window toggle has something visible to show
      // rather than both windows landing on the same overall figures.
      { localTime: `${dateKey}T04:00`, localDate: dateKey, height: 4.6 + dayOffset * 0.05, type: 'high' },
      { localTime: `${dateKey}T10:15`, localDate: dateKey, height: 0.6 + dayOffset * 0.02, type: 'low' },
      { localTime: `${dateKey}T16:24`, localDate: dateKey, height: 4.3 + dayOffset * 0.05, type: 'high' },
      { localTime: `${dateKey}T22:36`, localDate: dateKey, height: 0.3 + dayOffset * 0.02, type: 'low' },
    );

    dayKeys.push(dateKey);
    sunriseTimes.push(`${dateKey}T06:15`);
    sunsetTimes.push(`${dateKey}T19:45`);
  }

  return {
    tideSeries: new TideSeries(time.map((t, i) => ({ time: t, height: height[i] }))),
    waveSeries: new WaveSeries({ time, wave_height: waveHeight }),
    windSeries: new WindSeries({ time, wind_speed: windSpeed, wind_direction: windDirection, wind_gusts: windGusts }),
    precipitationSeries: new PrecipitationSeries({ time, precipitation }),
    temperatureSeries: new TemperatureSeries({ time, temperature, apparent_temperature: apparentTemperature }),
    sunBrightnessSeries: new SunBrightnessSeries({ time, shortwave_radiation: shortwaveRadiation }),
    cloudCoverSeries: new CloudCoverSeries({ time, cloud_cover: cloudCover }),
    daylightSeries: new DaylightSeries({ time: dayKeys, sunrise: sunriseTimes, sunset: sunsetTimes }),
    seaTemperatureSeries: new SeaTemperatureSeries({ time, sea_surface_temperature: seaTemperature }),
    seaCurrentSeries: new SeaCurrentSeries({
      time,
      ocean_current_direction: oceanCurrentDirection,
      ocean_current_velocity: oceanCurrentVelocity,
    }),
    forecast: new TideForecast(extremes),
  };
}

function PreviewContent() {
  const { colors, fonts, themeName, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);
  const data = useMemo(buildSyntheticForecast, []);
  const [now, setNow] = useState(() => new Date());
  const [scrubTime, setScrubTime] = useState<Date | null>(null);
  // Local to the preview: which forecast-list row is highlighted.
  const [selectedDateKey, setSelectedDateKey] = useState(TideClock.dateKey(now));
  const [forecastDetail, setForecastDetail] = useState<ForecastDetail>('stats');
  const [forecastWindow, setForecastWindow] = useState<ForecastWindow>('daytime');
  const chartHours = hoursFor(forecastWindow);

  const yesterday = data.forecast.yesterday(now);
  const forecastDays = data.forecast.days(now, 5);

  const insights = buildDayInsights({
    windSeries: data.windSeries,
    precipitationSeries: data.precipitationSeries,
    daylightSeries: data.daylightSeries,
    temperatureSeries: data.temperatureSeries,
    sunBrightnessSeries: data.sunBrightnessSeries,
    cloudCoverSeries: data.cloudCoverSeries,
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
            <Pressable
              style={styles.themeButton}
              onPress={() => setForecastDetail((mode) => (mode === 'stats' ? 'summary' : 'stats'))}
            >
              <Text style={styles.themeButtonText}>{forecastDetail}</Text>
            </Pressable>
            <Pressable
              style={styles.themeButton}
              onPress={() => setForecastWindow((mode) => (mode === 'daytime' ? 'wholeDay' : 'daytime'))}
            >
              <Text style={styles.themeButtonText}>{forecastWindow}</Text>
            </Pressable>
          </View>

          <CurrentLevelCard
            current={current}
            waveHeight={data.waveSeries.heightAt(now)}
            waveTrend={data.waveSeries.trend(now)}
            windSpeed={data.windSeries.speedAt(now)}
            windDirection={data.windSeries.directionAt(now)}
            windTrend={data.windSeries.trend(now)}
            seaTemp={data.seaTemperatureSeries.tempAt(now)}
            waterQuality={{ status: 'clear', siteName: null, classification: 'good', fetchedAt: now }}
            fetchedAt={now}
            dayLabel={null}
            onPressUpdated={() => {
              setNow(new Date());
              setScrubTime(null);
            }}
            location={DEFAULT_LOCATION}
            onPressLocation={() => {}}
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
              startHour={chartHours.startHour}
              endHour={chartHours.endHour}
              currentDirection={data.seaCurrentSeries.directionAt(now)}
              currentVelocity={data.seaCurrentSeries.velocityAt(now)}
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
              startHour={chartHours.startHour}
              endHour={chartHours.endHour}
            />
          </View>

          <View style={styles.section}>
            <TemperatureChart
              series={data.temperatureSeries}
              sunBrightnessSeries={data.sunBrightnessSeries}
              cloudCoverSeries={data.cloudCoverSeries}
              daylightSeries={data.daylightSeries}
              now={now}
              isToday
              scrubTime={scrubTime}
              onScrub={setScrubTime}
              startHour={chartHours.startHour}
              endHour={chartHours.endHour}
            />
          </View>

          <View style={styles.section}>
            <ForecastList
              yesterday={yesterday}
              days={forecastDays}
              selectedDateKey={selectedDateKey}
              onSelectDay={setSelectedDateKey}
              now={now}
              detail={forecastDetail}
              window={forecastWindow}
              windSeries={data.windSeries}
              precipitationSeries={data.precipitationSeries}
              temperatureSeries={data.temperatureSeries}
              sunBrightnessSeries={data.sunBrightnessSeries}
              cloudCoverSeries={data.cloudCoverSeries}
              daylightSeries={data.daylightSeries}
              seaTemperatureSeries={data.seaTemperatureSeries}
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
