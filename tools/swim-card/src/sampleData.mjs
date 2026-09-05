// Synthetic TideCheck/Open-Meteo-shaped fixtures for `--sample` — lets
// anyone preview the card (and lets this tool be tested) without an API
// key or network access, by running through the exact same compute.mjs
// path real data takes. Anchored to whatever `now` is passed in, not a
// fixed date, so the preview always looks sensible whenever it's run.

import { formatLondonWallTimeString, londonDateKey } from './tideClock.mjs';

const TIDAL_PERIOD_MS = 12.42 * 3600 * 1000; // semi-diurnal, M2 constituent
const MEAN_HEIGHT_M = 4.15;
const AMPLITUDE_M = 1.85; // low 2.3m / high 6.0m, in the mockup's range

function tideHeightAt(date, anchorLowTime) {
  const phase = ((date.getTime() - anchorLowTime.getTime()) / TIDAL_PERIOD_MS) * 2 * Math.PI;
  return MEAN_HEIGHT_M - AMPLITUDE_M * Math.cos(phase);
}

function buildTideFixture(now) {
  // The next low sits a couple of hours out, so the card's "next extreme"
  // reads as an upcoming low with the tide currently ebbing — same
  // storyline as the mockup ("low 11:49 · going out").
  const anchorLowTime = new Date(now.getTime() + 2 * 3600_000);

  const windowStart = new Date(now.getTime() - 8 * 3600_000);
  const windowEnd = new Date(now.getTime() + 30 * 3600_000);

  const timeSeries = [];
  for (let t = windowStart.getTime(); t <= windowEnd.getTime(); t += 15 * 60_000) {
    const date = new Date(t);
    timeSeries.push({ time: formatLondonWallTimeString(date), height: tideHeightAt(date, anchorLowTime) });
  }

  const extremes = [];
  const halfPeriod = TIDAL_PERIOD_MS / 2;
  let k = Math.ceil((windowStart.getTime() - anchorLowTime.getTime()) / halfPeriod) - 1;
  for (;;) {
    const t = new Date(anchorLowTime.getTime() + k * halfPeriod);
    if (t.getTime() > windowEnd.getTime()) break;
    if (t.getTime() >= windowStart.getTime()) {
      const isLow = ((k % 2) + 2) % 2 === 0;
      extremes.push({
        localTime: formatLondonWallTimeString(t),
        localDate: londonDateKey(t),
        height: isLow ? MEAN_HEIGHT_M - AMPLITUDE_M : MEAN_HEIGHT_M + AMPLITUDE_M,
        type: isLow ? 'low' : 'high',
      });
    }
    k += 1;
  }

  return { extremes, timeSeries };
}

function hourlySamples(now, spanHours, fn) {
  const time = [];
  const values = [];
  for (let h = -24; h <= spanHours; h++) {
    const date = new Date(now.getTime() + h * 3600_000);
    time.push(formatLondonWallTimeString(date));
    values.push(fn(h, date));
  }
  return { time, values };
}

function buildWeatherFixture(now) {
  // Wave: bobbing gently around 0.8m ("bouncy"), one slow cycle a day.
  const wave = hourlySamples(now, 48, (h) => 0.8 + 0.15 * Math.sin((h / 24) * 2 * Math.PI));
  // Sea temperature: near-flat around 19.6°C, a small diurnal wobble.
  const seaTemp = hourlySamples(now, 48, (h) => 19.6 + 0.2 * Math.sin((h / 24) * 2 * Math.PI - 1));
  // Wind: light westerly, ~7mph.
  const windSpeed = hourlySamples(now, 48, (h) => 7 + 1.5 * Math.sin((h / 9) * 2 * Math.PI));
  const windDirection = hourlySamples(now, 48, () => 270);
  // Air temperature: a normal diurnal curve peaking mid-afternoon.
  const airTemp = hourlySamples(now, 48, (h, date) => {
    const hourOfDay = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(date),
    );
    return 12 + 4 * Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI);
  });
  // Cloud cover: low, clear morning.
  const cloudCover = hourlySamples(now, 48, () => 8);

  const todayKey = londonDateKey(now);
  const tomorrowKey = londonDateKey(new Date(now.getTime() + 86_400_000));
  const sunsetToday = new Date(now);
  sunsetToday.setHours(19, 35, 0, 0);
  const sunsetTomorrow = new Date(sunsetToday.getTime() + 86_400_000 - 60_000);

  return {
    wave: { time: wave.time, wave_height: wave.values },
    seaTemperature: { time: seaTemp.time, sea_surface_temperature: seaTemp.values },
    wind: { time: windSpeed.time, wind_speed: windSpeed.values, wind_direction: windDirection.values },
    temperature: { time: airTemp.time, temperature: airTemp.values },
    cloudCover: { time: cloudCover.time, cloud_cover: cloudCover.values },
    daylight: {
      time: [todayKey, tomorrowKey],
      sunrise: [formatLondonWallTimeString(new Date(sunsetToday.getTime() - 12 * 3600_000)), formatLondonWallTimeString(new Date(sunsetTomorrow.getTime() - 12 * 3600_000))],
      sunset: [formatLondonWallTimeString(sunsetToday), formatLondonWallTimeString(sunsetTomorrow)],
    },
  };
}

export function buildSampleData(now = new Date()) {
  return { tide: buildTideFixture(now), weather: buildWeatherFixture(now) };
}
