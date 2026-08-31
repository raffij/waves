import { useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { DaylightSeries } from '../services/DaylightSeries';
import { DAY_WINDOW_END_HOUR, DAY_WINDOW_START_HOUR } from '../services/DayWindow';
import type { SunBrightnessSeries } from '../services/SunBrightnessSeries';
import type { TemperatureSeries } from '../services/TemperatureSeries';
import { TideClock } from '../services/TideClock';
import type { Colors } from '../theme';
import { daylightBands } from './daylight';

interface Props {
  series: TemperatureSeries;
  sunBrightnessSeries?: SunBrightnessSeries | null;
  daylightSeries?: DaylightSeries | null;
  now: Date;
  /** Whether `now` is the real current moment vs. a same-hour projection onto another day (see App.tsx). */
  isToday?: boolean;
  /** Shared scrub reading (dragged/tapped time), lifted to App.tsx so dragging any one chart moves the crosshair on all of them together. Null means "show the live/reference reading". */
  scrubTime?: Date | null;
  onScrub?: (time: Date | null) => void;
  startHour?: number;
  endHour?: number;
}

const DEFAULT_WIDTH = 320;
const HEIGHT = 115;
const PADDING_X = 8;
const PADDING_LEFT = PADDING_X;
const PADDING_TOP = 26; // extra room for the scrub tooltip
const PADDING_BOTTOM = 4;
const TOOLTIP_WIDTH = 210;
// Veils the elapsed portion of the chart under the screen background color,
// matching TideChart/PrecipitationChart's past-hours fade.
const PAST_FADE_OPACITY = 0.55;
// Unlike tide/wave/rain, 0°C isn't "no temperature" — there's no meaningful
// zero baseline to anchor the axis on, so (unlike those charts) it's scaled
// to the day's own min/max instead, padded a little so the line never
// touches the top/bottom edge, and floored at a minimum span so a dead-calm,
// near-constant day doesn't get blown up into a jittery-looking line.
const TEMP_AXIS_PADDING_C = 2;
const MIN_TEMP_SPAN_C = 4;

export function TemperatureChart({
  series,
  sunBrightnessSeries,
  daylightSeries,
  now,
  isToday = true,
  scrubTime = null,
  onScrub,
  startHour = DAY_WINDOW_START_HOUR,
  endHour = DAY_WINDOW_END_HOUR,
}: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const onLayout = (evt: LayoutChangeEvent) => {
    const measured = evt.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - width) > 0.5) setWidth(measured);
  };

  const start = TideClock.londonDateAtHour(now, startHour);
  const end = TideClock.londonDateAtHour(now, endHour);

  const tempSamples = series.samplesEvery(15, start, end);
  const feelsLikeSamples = tempSamples.filter(
    (s): s is { time: Date; temp: number | null; feelsLike: number } => s.feelsLike !== null,
  );
  const realTempSamples = tempSamples.filter(
    (s): s is { time: Date; temp: number; feelsLike: number | null } => s.temp !== null,
  );

  const sunSamples = sunBrightnessSeries
    ? sunBrightnessSeries
        .samplesEvery(15, start, end)
        .filter((s): s is { time: Date; wattsPerM2: number } => s.wattsPerM2 !== null)
    : [];

  const plotWidth = width - PADDING_LEFT - PADDING_X;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const totalMs = end.getTime() - start.getTime();

  // See TideChart's identical comment: PanResponder.create(...) only runs
  // once, so its callbacks need refs to read the current width/start/end
  // rather than closing over stale values from first mount. Reports through
  // onScrub (state lifted to App.tsx) so dragging this chart moves the
  // crosshair on the other charts too.
  const widthRef = useRef(width);
  widthRef.current = width;
  const geometryRef = useRef({ start, end, plotWidth });
  geometryRef.current = { start, end, plotWidth };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const w = widthRef.current;
        const { start, end, plotWidth } = geometryRef.current;
        const x = Math.min(Math.max(evt.nativeEvent.locationX, PADDING_LEFT), w - PADDING_X);
        onScrub?.(new Date(start.getTime() + ((x - PADDING_LEFT) / plotWidth) * (end.getTime() - start.getTime())));
      },
      onPanResponderMove: (evt) => {
        const w = widthRef.current;
        const { start, end, plotWidth } = geometryRef.current;
        const x = Math.min(Math.max(evt.nativeEvent.locationX, PADDING_LEFT), w - PADDING_X);
        onScrub?.(new Date(start.getTime() + ((x - PADDING_LEFT) / plotWidth) * (end.getTime() - start.getTime())));
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  if (feelsLikeSamples.length < 2 && realTempSamples.length < 2) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No chart data available</Text>
      </View>
    );
  }

  const allTemps = [...feelsLikeSamples.map((s) => s.feelsLike), ...realTempSamples.map((s) => s.temp)];
  const rawMin = Math.min(...allTemps);
  const rawMax = Math.max(...allTemps);
  let tempMin = rawMin - TEMP_AXIS_PADDING_C;
  let tempMax = rawMax + TEMP_AXIS_PADDING_C;
  if (tempMax - tempMin < MIN_TEMP_SPAN_C) {
    const mid = (tempMax + tempMin) / 2;
    tempMin = mid - MIN_TEMP_SPAN_C / 2;
    tempMax = mid + MIN_TEMP_SPAN_C / 2;
  }
  const tempSpan = tempMax - tempMin;

  const sunValues = sunSamples.map((s) => s.wattsPerM2);
  const sunMax = sunValues.length > 0 ? Math.max(...sunValues) : 1;
  const sunSpread = sunMax || 1;

  const toX = (time: Date) => PADDING_LEFT + ((time.getTime() - start.getTime()) / totalMs) * plotWidth;
  const toTempY = (value: number) => PADDING_TOP + (1 - (value - tempMin) / tempSpan) * plotHeight;
  const toSunY = (value: number) => PADDING_TOP + (1 - value / sunSpread) * plotHeight;

  const floorY = PADDING_TOP + plotHeight;
  const tempGridLines = [tempMax, (tempMax + tempMin) / 2, tempMin].map((value) => ({ value, y: toTempY(value) }));

  const feelsLikePoints = feelsLikeSamples.map((s) => ({ x: toX(s.time), y: toTempY(s.feelsLike) }));
  const feelsLikePath = feelsLikePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const feelsLikeAreaPath =
    feelsLikePoints.length > 0
      ? `${feelsLikePath} L ${feelsLikePoints[feelsLikePoints.length - 1].x.toFixed(1)} ${floorY} L ${feelsLikePoints[0].x.toFixed(1)} ${floorY} Z`
      : '';

  const realTempPoints = realTempSamples.map((s) => ({ x: toX(s.time), y: toTempY(s.temp) }));
  const realTempPath = realTempPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // Filled from the curve down to the floor, like the tide chart's own area
  // — a bright hour (curve near the top) fills most of the column with a
  // sun-colored glow, a dim/night hour leaves only a thin sliver.
  const sunPoints = sunSamples.map((s) => ({ x: toX(s.time), y: toSunY(s.wattsPerM2) }));
  const sunPath = sunPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const sunAreaPath =
    sunPoints.length > 0
      ? `${sunPath} L ${sunPoints[sunPoints.length - 1].x.toFixed(1)} ${floorY} L ${sunPoints[0].x.toFixed(1)} ${floorY} Z`
      : '';

  const currentX = toX(now);
  const pastFadeEndX = Math.min(Math.max(currentX, PADDING_LEFT), width - PADDING_X);

  const isScrubbing = scrubTime !== null;
  const activeTime = scrubTime ?? new Date(Math.min(Math.max(now.getTime(), start.getTime()), end.getTime()));
  const activeFeelsLike = series.feelsLikeAt(activeTime);
  const activeTemp = series.tempAt(activeTime);
  const activeSun = sunBrightnessSeries?.brightnessAt(activeTime) ?? null;
  const activePoint = activeFeelsLike !== null ? { x: toX(activeTime), y: toTempY(activeFeelsLike) } : null;

  const hourTicks = [startHour, Math.round((startHour + endHour) / 2), endHour];

  const daylight = daylightBands({ series: daylightSeries, start, end, plotLeft: PADDING_LEFT, plotWidth });

  const feelsLikeValues = feelsLikeSamples.map((s) => s.feelsLike);
  const realTempValues = realTempSamples.map((s) => s.temp);

  return (
    <View onLayout={onLayout}>
      <View style={styles.chartArea}>
        <Svg width={width} height={HEIGHT}>
          {daylight.night.map((band) => (
            <Rect
              key={band.key}
              x={band.x}
              y={PADDING_TOP}
              width={band.width}
              height={plotHeight}
              fill={colors.night}
            />
          ))}
          {daylight.marks.map((mark) => (
            <Line
              key={mark.key}
              x1={mark.x}
              y1={PADDING_TOP}
              x2={mark.x}
              y2={floorY}
              stroke={colors.textSecondary}
              strokeDasharray="2,3"
              strokeWidth={1}
              opacity={0.4}
            />
          ))}
          {tempGridLines.map((g) => (
            <Line
              key={g.value}
              x1={PADDING_LEFT}
              y1={g.y}
              x2={width - PADDING_X}
              y2={g.y}
              stroke={colors.cardBorder}
              strokeWidth={1}
            />
          ))}
          {sunAreaPath && <Path d={sunAreaPath} fill={colors.sun} fillOpacity={0.16} stroke="none" />}
          {sunPath && (
            <Path
              d={sunPath}
              fill="none"
              stroke={colors.sun}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.55}
            />
          )}
          {feelsLikeAreaPath && <Path d={feelsLikeAreaPath} fill={colors.feelsLike} fillOpacity={0.14} stroke="none" />}
          {realTempPath && (
            <Path
              d={realTempPath}
              fill="none"
              stroke={colors.temperature}
              strokeWidth={2}
              strokeDasharray="4,3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          )}
          {feelsLikePath && (
            <Path
              d={feelsLikePath}
              fill="none"
              stroke={colors.feelsLike}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {isToday && pastFadeEndX > PADDING_LEFT && (
            <Rect
              x={PADDING_LEFT}
              y={PADDING_TOP}
              width={pastFadeEndX - PADDING_LEFT}
              height={plotHeight}
              fill={colors.background}
              opacity={PAST_FADE_OPACITY}
            />
          )}
          {!isScrubbing && currentX >= PADDING_LEFT && currentX <= width - PADDING_X && (
            <Line
              x1={currentX}
              y1={PADDING_TOP}
              x2={currentX}
              y2={floorY}
              stroke={colors.textSecondary}
              strokeWidth={1.5}
              opacity={0.5}
            />
          )}
          {activePoint && (
            <>
              <Line
                x1={activePoint.x}
                y1={PADDING_TOP}
                x2={activePoint.x}
                y2={floorY}
                stroke={colors.textSecondary}
                strokeDasharray={isScrubbing ? undefined : '3,4'}
                strokeWidth={1}
              />
              <Circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={isScrubbing ? 6 : 5}
                fill={colors.textPrimary}
                stroke={colors.feelsLike}
                strokeWidth={2}
              />
            </>
          )}
        </Svg>
        {activeFeelsLike !== null && activePoint && (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              { left: Math.min(Math.max(activePoint.x - TOOLTIP_WIDTH / 2, 0), width - TOOLTIP_WIDTH) },
            ]}
          >
            <Text style={styles.tooltipText} numberOfLines={2}>
              {TideClock.format(activeTime, { hour: '2-digit', minute: '2-digit', hour12: false })} ·{' '}
              {Math.round(activeFeelsLike)}° feels
              {activeTemp !== null && ` / ${Math.round(activeTemp)}° real`}
              {activeSun !== null && ` / ${Math.round(activeSun)}W/m²`}
            </Text>
          </View>
        )}
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
      </View>
      <View style={styles.axisRow}>
        {hourTicks.map((h) => (
          <Text key={h} style={styles.axisLabel}>
            {String(h).padStart(2, '0')}:00
          </Text>
        ))}
      </View>
      <View style={styles.legendRow}>
        {feelsLikeValues.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.feelsLike }]} />
            <Text style={styles.legendText}>
              Feels {Math.round(Math.min(...feelsLikeValues))}–{Math.round(Math.max(...feelsLikeValues))}°
            </Text>
          </View>
        )}
        {realTempValues.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.temperature }]} />
            <Text style={styles.legendText}>
              Real {Math.round(Math.min(...realTempValues))}–{Math.round(Math.max(...realTempValues))}°
            </Text>
          </View>
        )}
        {sunValues.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.sun }]} />
            <Text style={styles.legendText}>Sun up to {Math.round(Math.max(...sunValues))}W/m²</Text>
          </View>
        )}
        {daylight.label && (
          <View style={styles.legendItem}>
            <View style={styles.legendNightSwatch} />
            <Text style={styles.legendText}>{daylight.label}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    chartArea: { position: 'relative' },
    axisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_X,
      marginTop: 4,
    },
    axisLabel: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.mono },
    emptyState: { padding: 24, alignItems: 'center' },
    emptyText: { color: colors.textSecondary },
    tooltip: {
      position: 'absolute',
      top: 0,
      width: TOOLTIP_WIDTH,
      alignItems: 'center',
      // Translucent and light-weight rather than a solid, bold pill — see
      // TideChart's identical tooltip for why.
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 8,
      paddingVertical: 3,
      paddingHorizontal: 6,
    },
    tooltipText: { color: '#f5faff', fontSize: 12, fontWeight: '500' },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
      marginTop: 6,
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_X,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      minHeight: 24,
      paddingVertical: 2,
    },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    legendNightSwatch: {
      width: 7,
      height: 7,
      borderRadius: 2,
      backgroundColor: colors.night,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    legendText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: fonts.mono },
  });
}
