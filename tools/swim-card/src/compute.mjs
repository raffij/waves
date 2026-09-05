// Turns raw TideCheck + Open-Meteo responses into the plain CardData shape
// render.mjs draws, so the drawing code never has to know about API
// response shapes and can be exercised with sampleData.mjs instead.

import { formatLondon, londonDateKey, londonHour, londonTimeZoneAbbreviation, parseLondonWallTime } from './tideClock.mjs';
import { compassPointFor, DirectionSeries, ValueSeries } from './series.mjs';

// This tool's own convention — there's no "how bouncy is it" reading
// anywhere else in the app to match, so these bands are new, tuned by eye
// against typical UK nearshore wave heights (0.1-1.5m).
const SEA_STATE_BANDS = [
  { max: 0.3, label: 'flat' },
  { max: 0.6, label: 'gentle' },
  { max: 1.0, label: 'bouncy' },
  { max: Infinity, label: 'rough' },
];

// Cloud-cover bands for the sky-condition line, matching the thresholds
// expo/src/services/dayInsights/sun.ts already uses for "overcast" (75%+)
// and "hazy" transitions, extended down to a plain "clear" reading below 25%.
const SKY_BANDS = [
  { max: 25, label: 'CLEAR SKIES' },
  { max: 60, label: 'PARTLY CLOUDY' },
  { max: 85, label: 'CLOUDY' },
  { max: Infinity, label: 'OVERCAST' },
];

function bandLabel(value, bands) {
  for (const band of bands) {
    if (value <= band.max) return band.label;
  }
  return bands[bands.length - 1].label;
}

function periodLabel(now) {
  const hour = londonHour(now);
  if (hour < 5) return 'NIGHT';
  if (hour < 12) return 'MORNING';
  if (hour < 17) return 'AFTERNOON';
  if (hour < 21) return 'EVENING';
  return 'NIGHT';
}

// The most recent extreme at/before `now`, then up to `count - 1` after it —
// roughly two tidal cycles (~24-26h), same window the mockup's "next 24
// hours" chart spans.
function extremeWindow(extremes, now, count = 5) {
  const parsed = extremes
    .map((e) => ({ ...e, time: parseLondonWallTime(e.localTime) }))
    .filter((e) => e.time !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  let startIdx = 0;
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].time.getTime() <= now.getTime()) startIdx = i;
  }
  return parsed.slice(startIdx, startIdx + count);
}

function nextExtreme(extremes, now) {
  const parsed = extremes
    .map((e) => ({ ...e, time: parseLondonWallTime(e.localTime) }))
    .filter((e) => e.time !== null && e.time.getTime() > now.getTime())
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  return parsed[0] ?? null;
}

export function computeCardData({ tide, weather, now = new Date() }) {
  const tideSeries = new ValueSeries(
    tide.timeSeries.map((p) => ({ time: parseLondonWallTime(p.time), value: p.height })),
  );
  const waveSeries = new ValueSeries(
    weather.wave.time.map((t, i) => ({ time: parseLondonWallTime(t), value: weather.wave.wave_height[i] ?? null })),
  );
  const seaTempSeries = new ValueSeries(
    weather.seaTemperature.time.map((t, i) => ({
      time: parseLondonWallTime(t),
      value: weather.seaTemperature.sea_surface_temperature[i] ?? null,
    })),
  );
  const windSpeedSeries = new ValueSeries(
    weather.wind.time.map((t, i) => ({ time: parseLondonWallTime(t), value: weather.wind.wind_speed[i] ?? null })),
  );
  const windDirectionSeries = new DirectionSeries(
    weather.wind.time.map((t, i) => ({
      time: parseLondonWallTime(t),
      value: weather.wind.wind_direction?.[i] ?? null,
    })),
  );
  const airTempSeries = new ValueSeries(
    weather.temperature.time.map((t, i) => ({
      time: parseLondonWallTime(t),
      value: weather.temperature.temperature[i] ?? null,
    })),
  );
  const cloudCoverSeries = new ValueSeries(
    weather.cloudCover.time.map((t, i) => ({ time: parseLondonWallTime(t), value: weather.cloudCover.cloud_cover[i] ?? null })),
  );

  const sunset = weather.daylight
    ? (() => {
        const idx = weather.daylight.time.indexOf(londonDateKey(now));
        return idx >= 0 ? parseLondonWallTime(weather.daylight.sunset[idx]) : null;
      })()
    : null;

  const next = nextExtreme(tide.extremes, now);
  const nowHeight = tideSeries.valueAt(now);
  const waveHeight = waveSeries.valueAt(now);
  const cloudCover = cloudCoverSeries.valueAt(now);
  const windDirection = windDirectionSeries.directionAt(now);
  const airTemp = airTempSeries.valueAt(now);
  const windSpeed = windSpeedSeries.valueAt(now);

  const window = extremeWindow(tide.extremes, now, 5);
  const curveFrom = window[0]?.time ?? new Date(now.getTime() - 6 * 3600_000);
  const curveTo = window[window.length - 1]?.time ?? new Date(now.getTime() + 24 * 3600_000);
  const curvePoints = tideSeries.pointsBetween(curveFrom, curveTo);

  return {
    now,
    periodLabel: periodLabel(now),
    dateLabel: formatLondon(now, { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase(),
    updatedLabel: `${formatLondon(now, { hour: '2-digit', minute: '2-digit', hour12: false })} ${londonTimeZoneAbbreviation(now)}`,
    airTempC: airTemp !== null ? Math.round(airTemp) : null,
    skyLabel: cloudCover !== null ? bandLabel(cloudCover, SKY_BANDS) : null,
    sunsetLabel: sunset ? formatLondon(sunset, { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
    windSpeedMph: windSpeed !== null ? Math.round(windSpeed) : null,
    windCompass: windDirection !== null ? compassPointFor(windDirection) : null,
    tide: {
      stateLabel: next?.type ?? null, // 'high' | 'low'
      stateTime: next ? formatLondon(next.time, { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
      direction: next?.type === 'low' ? 'going out' : next?.type === 'high' ? 'going in' : null,
      nowHeightM: nowHeight,
    },
    seaTempC: seaTempSeries.valueAt(now),
    waveHeightM: waveHeight,
    seaStateLabel: waveHeight !== null ? bandLabel(waveHeight, SEA_STATE_BANDS) : null,
    tide24h: {
      now,
      points: curvePoints.map((p) => ({ time: p.time, heightM: p.value })),
      extremes: window.map((e) => ({
        type: e.type,
        time: e.time,
        timeLabel: formatLondon(e.time, { hour: '2-digit', minute: '2-digit', hour12: false }),
        heightM: e.height,
      })),
    },
  };
}
