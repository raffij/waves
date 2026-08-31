import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { CloudCoverSeries } from '../services/CloudCoverSeries';
import { type DayCondition, dayCondition } from '../services/DayCondition';
import { buildDayInsights } from '../services/DayInsights';
import type { DaylightSeries } from '../services/DaylightSeries';
import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from '../services/DayWindow';
import type { PrecipitationSeries } from '../services/PrecipitationSeries';
import type { SunBrightnessSeries } from '../services/SunBrightnessSeries';
import type { TemperatureSeries } from '../services/TemperatureSeries';
import { TideClock } from '../services/TideClock';
import type { ForecastDay } from '../services/TideForecast';
import type { WindSeries } from '../services/WindSeries';
import type { Colors } from '../theme';

export type ForecastDetail = 'stats' | 'summary';
// "daytime" reads only DAY_WINDOW's waking hours (06:00–20:00) — the
// figures that actually help decide what to do with the day, rather than
// a high/low dragged down by 3am. "wholeDay" reads the full 24h.
export type ForecastWindow = 'daytime' | 'wholeDay';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  selectedDateKey: string;
  onSelectDay: (dateKey: string) => void;
  now: Date;
  detail: ForecastDetail;
  window: ForecastWindow;
  windSeries?: WindSeries | null;
  precipitationSeries?: PrecipitationSeries | null;
  temperatureSeries?: TemperatureSeries | null;
  sunBrightnessSeries?: SunBrightnessSeries | null;
  cloudCoverSeries?: CloudCoverSeries | null;
  daylightSeries?: DaylightSeries | null;
}

type Series = Pick<
  Props,
  | 'windSeries'
  | 'precipitationSeries'
  | 'temperatureSeries'
  | 'sunBrightnessSeries'
  | 'cloudCoverSeries'
  | 'daylightSeries'
>;
// Resolved start/end hours for the chosen ForecastWindow. Named `hours`
// rather than `window` throughout below (unlike the public prop, which
// takes the prop-naming convention from `detail`) to avoid shadowing the
// DOM/browser `window` global this runs under on web.
interface Hours {
  startHour: number;
  endHour: number;
}
type Styles = ReturnType<typeof getStyles>;

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
const WHOLE_DAY_HOURS: Hours = { startHour: 0, endHour: 23 };
const DAYTIME_HOURS: Hours = { startHour: DAY_WINDOW_START_HOUR, endHour: DAY_WINDOW_END_HOUR };

function hoursFor(forecastWindow: ForecastWindow): Hours {
  return forecastWindow === 'daytime' ? DAYTIME_HOURS : WHOLE_DAY_HOURS;
}

const CONDITION_ICON: Record<DayCondition, keyof typeof Ionicons.glyphMap> = {
  rain: 'rainy-outline',
  sunny: 'sunny-outline',
  hazy: 'partly-sunny-outline',
  overcast: 'cloudy-outline',
};

function conditionColor(condition: DayCondition, colors: Colors): string {
  if (condition === 'rain') return colors.precipitation;
  if (condition === 'sunny' || condition === 'hazy') return colors.sun;
  return colors.textSecondary;
}

// High/low over an hourly-sampled continuous series (wind, temperature) —
// `null` readings are skipped rather than treated as zero, same as every
// other figure in this file.
function hourlyRange(
  sampleAt: (date: Date) => number | null,
  date: Date,
  hours: Hours,
): { high: number | null; low: number | null } {
  const values: number[] = [];
  for (let h = hours.startHour; h <= hours.endHour; h++) {
    const v = sampleAt(TideClock.londonDateAtHour(date, h));
    if (v !== null) values.push(v);
  }
  return values.length > 0 ? { high: Math.max(...values), low: Math.min(...values) } : { high: null, low: null };
}

// Tide highs/lows are discrete events (not an hourly series), so "within
// the window" means filtering the day's own extremes by clock time rather
// than sampling — a high tide at 04:00 doesn't count toward a "daytime"
// reading, but does for "whole day".
function tideExtremes(day: ForecastDay, date: Date, hours: Hours): { high: number | null; low: number | null } {
  const windowStart = TideClock.londonDateAtHour(date, hours.startHour);
  const windowEnd = TideClock.londonDateAtHour(date, hours.endHour);
  const inWindow = (localTime: string) => {
    const t = TideClock.parseLondonWallTime(localTime);
    return t !== null && t.getTime() >= windowStart.getTime() && t.getTime() <= windowEnd.getTime();
  };
  const highs = day.extremes.filter((e) => e.type === 'high' && inWindow(e.localTime)).map((e) => e.height);
  const lows = day.extremes.filter((e) => e.type === 'low' && inWindow(e.localTime)).map((e) => e.height);
  return {
    high: highs.length > 0 ? Math.max(...highs) : null,
    low: lows.length > 0 ? Math.min(...lows) : null,
  };
}

// The "stats" reading: tide/wind/sun/light figures for the day, within the
// chosen hours — a day tile means "what this day looked like", not "what's
// still ahead" (contrast DayInsights' tense-aware summary below). Light
// (sunrise/sunset) is never windowed — it's the actual daily event, not a
// reading that could fall outside daytime hours.
function statsLine(day: ForecastDay, series: Series, date: Date, hours: Hours): string | null {
  const { high: tideHigh, low: tideLow } = tideExtremes(day, date, hours);
  const wind = hourlyRange((d) => series.windSeries?.speedAt(d) ?? null, date, hours);
  const sun = hourlyRange((d) => series.sunBrightnessSeries?.brightnessAt(d) ?? null, date, hours);
  const sunrise = series.daylightSeries?.sunrise(date) ?? null;
  const sunset = series.daylightSeries?.sunset(date) ?? null;

  const parts: string[] = [];
  if (tideHigh !== null && tideLow !== null) parts.push(`Tide ${tideLow.toFixed(1)}–${tideHigh.toFixed(1)}m`);
  if (wind.low !== null && wind.high !== null) parts.push(`Wind ${Math.round(wind.low)}–${Math.round(wind.high)}mph`);
  if (sun.high !== null) parts.push(`Sun up to ${Math.round(sun.high)}W/m²`);
  if (sunrise && sunset) parts.push(`Light ${TideClock.format(sunrise, HHMM)}–${TideClock.format(sunset, HHMM)}`);

  return parts.length > 0 ? parts.join(' · ') : null;
}

// The "summary" reading: the same worded sentence DayInsights builds for
// the main screen, just for this day instead of the live one. Always reads
// DayInsights' own fixed daytime window (see its own comments) regardless
// of the forecast list's window toggle — it already excludes sleeping
// hours by design, so there's nothing for "whole day" to widen here.
function summaryLine(day: ForecastDay, series: Series, now: Date): string | null {
  const reference = day.dateKey === TideClock.dateKey(now) ? now : TideClock.dateFromKey(day.dateKey);
  const insights = buildDayInsights({
    windSeries: series.windSeries ?? null,
    precipitationSeries: series.precipitationSeries ?? null,
    daylightSeries: series.daylightSeries ?? null,
    temperatureSeries: series.temperatureSeries ?? null,
    sunBrightnessSeries: series.sunBrightnessSeries ?? null,
    cloudCoverSeries: series.cloudCoverSeries ?? null,
    reference,
  });
  return insights.summary;
}

function DayRow({
  day,
  isSelected,
  onSelect,
  colors,
  styles,
  series,
  now,
  detail,
  hours,
}: {
  day: ForecastDay;
  isSelected: boolean;
  onSelect: () => void;
  colors: Colors;
  styles: Styles;
  series: Series;
  now: Date;
  detail: ForecastDetail;
  hours: Hours;
}) {
  const date = TideClock.dateFromKey(day.dateKey);
  const condition = dayCondition(
    day.dateKey,
    series.precipitationSeries ?? null,
    series.sunBrightnessSeries ?? null,
    series.cloudCoverSeries ?? null,
    hours,
  );
  const { high: tempHigh, low: tempLow } = hourlyRange((d) => series.temperatureSeries?.tempAt(d) ?? null, date, hours);
  const rainTotal =
    series.precipitationSeries?.totalBetween(
      TideClock.londonDateAtHour(date, hours.startHour),
      TideClock.londonDateAtHour(date, hours.endHour),
    ) ?? null;
  const detailText = detail === 'summary' ? summaryLine(day, series, now) : statsLine(day, series, date, hours);

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityLabel={`${day.label}, high ${tempHigh !== null ? Math.round(tempHigh) : 'unavailable'} degrees, low ${tempLow !== null ? Math.round(tempLow) : 'unavailable'}, ${rainTotal !== null && rainTotal > 0 ? `${rainTotal.toFixed(1)} millimetres rain` : 'dry'}`}
      accessibilityState={{ selected: isSelected }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTop}>
        <Ionicons
          name={CONDITION_ICON[condition]}
          size={16}
          color={conditionColor(condition, colors)}
          style={styles.icon}
        />
        <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]} numberOfLines={1}>
          {day.label}
        </Text>
        <Text style={styles.tempText} numberOfLines={1}>
          {tempHigh !== null ? `${Math.round(tempHigh)}°` : '—'}
          <Text style={styles.tempLowText}>{tempLow !== null ? ` / ${Math.round(tempLow)}°` : ''}</Text>
        </Text>
        <Text style={[styles.rainText, rainTotal !== null && rainTotal > 0 && { color: colors.precipitation }]}>
          {rainTotal !== null && rainTotal > 0 ? `${rainTotal.toFixed(1)}mm` : '—'}
        </Text>
      </View>
      {detailText && <Text style={styles.detailText}>{detailText}</Text>}
    </Pressable>
  );
}

export function ForecastList({
  yesterday,
  days,
  selectedDateKey,
  onSelectDay,
  now,
  detail,
  window: forecastWindow,
  windSeries,
  precipitationSeries,
  temperatureSeries,
  sunBrightnessSeries,
  cloudCoverSeries,
  daylightSeries,
}: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);
  const series: Series = {
    windSeries,
    precipitationSeries,
    temperatureSeries,
    sunBrightnessSeries,
    cloudCoverSeries,
    daylightSeries,
  };
  const hours = hoursFor(forecastWindow);

  const allDays = yesterday ? [yesterday, ...days] : days;

  return (
    <View>
      {allDays.map((day) => (
        <DayRow
          key={day.dateKey}
          day={day}
          isSelected={day.dateKey === selectedDateKey}
          onSelect={() => onSelectDay(day.dateKey)}
          colors={colors}
          styles={styles}
          series={series}
          now={now}
          detail={detail}
          hours={hours}
        />
      ))}
    </View>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    row: {
      minHeight: 44,
      justifyContent: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.cardBorder,
    },
    rowPressed: { opacity: 0.55 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    icon: { width: 16 },
    dayLabel: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      fontFamily: fonts.mono,
    },
    dayLabelSelected: { color: colors.primary },
    tempText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      fontFamily: fonts.monoBold,
    },
    tempLowText: { color: colors.textSecondary, fontWeight: '600', fontFamily: fonts.mono },
    rainText: {
      minWidth: 52,
      textAlign: 'right',
      color: colors.textSecondary,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      fontFamily: fonts.mono,
    },
    detailText: {
      marginTop: 4,
      marginLeft: 24,
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: fonts.mono,
    },
  });
}
