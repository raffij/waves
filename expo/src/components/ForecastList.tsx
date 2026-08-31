import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import { type DayCondition, dayCondition } from '../services/DayCondition';
import type { DaylightSeries } from '../services/DaylightSeries';
import type { PrecipitationSeries } from '../services/PrecipitationSeries';
import type { SunBrightnessSeries } from '../services/SunBrightnessSeries';
import type { TemperatureSeries } from '../services/TemperatureSeries';
import { TideClock } from '../services/TideClock';
import type { ForecastDay } from '../services/TideForecast';
import type { WindSeries } from '../services/WindSeries';
import type { Colors } from '../theme';

interface Props {
  yesterday: ForecastDay | null;
  days: ForecastDay[];
  selectedDateKey: string;
  onSelectDay: (dateKey: string) => void;
  windSeries?: WindSeries | null;
  precipitationSeries?: PrecipitationSeries | null;
  temperatureSeries?: TemperatureSeries | null;
  sunBrightnessSeries?: SunBrightnessSeries | null;
  daylightSeries?: DaylightSeries | null;
}

type Series = Pick<
  Props,
  'windSeries' | 'precipitationSeries' | 'temperatureSeries' | 'sunBrightnessSeries' | 'daylightSeries'
>;
type Styles = ReturnType<typeof getStyles>;

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

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

function tideExtremes(day: ForecastDay): { high: number | null; low: number | null } {
  const highs = day.extremes.filter((e) => e.type === 'high').map((e) => e.height);
  const lows = day.extremes.filter((e) => e.type === 'low').map((e) => e.height);
  return {
    high: highs.length > 0 ? Math.max(...highs) : null,
    low: lows.length > 0 ? Math.min(...lows) : null,
  };
}

// The expanded (selected-day) detail line, gathered in one place. A day
// tile means "what this day looked like" rather than "what's still ahead",
// so — unlike the charts' tense-aware `now` — this always reads the day's
// full 24h data, whichever day that is.
function detailLine(day: ForecastDay, series: Series): string | null {
  const date = TideClock.dateFromKey(day.dateKey);
  const { high: tideHigh, low: tideLow } = tideExtremes(day);
  const wind = series.windSeries?.dailyExtremes(date) ?? { high: null, low: null };
  const sunPeak = series.sunBrightnessSeries?.dailyPeak(date) ?? null;
  const sunrise = series.daylightSeries?.sunrise(date) ?? null;
  const sunset = series.daylightSeries?.sunset(date) ?? null;

  const parts: string[] = [];
  if (tideHigh !== null && tideLow !== null) parts.push(`Tide ${tideLow.toFixed(1)}–${tideHigh.toFixed(1)}m`);
  if (wind.low !== null && wind.high !== null) parts.push(`Wind ${Math.round(wind.low)}–${Math.round(wind.high)}mph`);
  if (sunPeak !== null) parts.push(`Sun up to ${Math.round(sunPeak)}W/m²`);
  if (sunrise && sunset) parts.push(`Light ${TideClock.format(sunrise, HHMM)}–${TideClock.format(sunset, HHMM)}`);

  return parts.length > 0 ? parts.join(' · ') : null;
}

function DayRow({
  day,
  isSelected,
  onSelect,
  colors,
  styles,
  series,
}: {
  day: ForecastDay;
  isSelected: boolean;
  onSelect: () => void;
  colors: Colors;
  styles: Styles;
  series: Series;
}) {
  const date = TideClock.dateFromKey(day.dateKey);
  const condition = dayCondition(day.dateKey, series.precipitationSeries ?? null, series.sunBrightnessSeries ?? null);
  const { high: tempHigh, low: tempLow } = series.temperatureSeries?.dailyExtremes(date) ?? { high: null, low: null };
  const rainTotal = series.precipitationSeries?.dailyTotal(date) ?? null;
  const detail = isSelected ? detailLine(day, series) : null;

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
      {detail && (
        <Text style={styles.detailText} numberOfLines={2}>
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

export function ForecastList({
  yesterday,
  days,
  selectedDateKey,
  onSelectDay,
  windSeries,
  precipitationSeries,
  temperatureSeries,
  sunBrightnessSeries,
  daylightSeries,
}: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);
  const series: Series = { windSeries, precipitationSeries, temperatureSeries, sunBrightnessSeries, daylightSeries };

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
