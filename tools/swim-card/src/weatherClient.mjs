// Fetches wave height, sea temperature, wind, cloud cover, air temperature
// and sunrise/sunset from Open-Meteo — no key required. Mirrors the two
// calls in expo/src/services/WaveAPIClient.ts (Marine API for wave/sea
// data, Forecast API for everything else), kept as its own standalone
// implementation per this repo's "no shared code between clients"
// convention. A -1/+2 day window is plenty for a single "right now" card
// (the app/xbar script use -1/+5 to cover a 5-day forecast list, which
// this one-shot card doesn't have).

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function fetchWeatherData(latitude, longitude, now = new Date()) {
  const startDate = formatDate(new Date(now.getTime() - 86_400_000));
  const endDate = formatDate(new Date(now.getTime() + 2 * 86_400_000));

  const marineUrl = new URL('https://marine-api.open-meteo.com/v1/marine');
  marineUrl.searchParams.set('latitude', latitude);
  marineUrl.searchParams.set('longitude', longitude);
  marineUrl.searchParams.set('start_date', startDate);
  marineUrl.searchParams.set('end_date', endDate);
  marineUrl.searchParams.set('hourly', 'wave_height,sea_surface_temperature');
  marineUrl.searchParams.set('timezone', 'Europe/London');

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', latitude);
  forecastUrl.searchParams.set('longitude', longitude);
  forecastUrl.searchParams.set('start_date', startDate);
  forecastUrl.searchParams.set('end_date', endDate);
  forecastUrl.searchParams.set('hourly', 'wind_speed_10m,wind_direction_10m,temperature_2m,cloud_cover');
  forecastUrl.searchParams.set('daily', 'sunrise,sunset');
  forecastUrl.searchParams.set('wind_speed_unit', 'mph');
  forecastUrl.searchParams.set('temperature_unit', 'celsius');
  forecastUrl.searchParams.set('timezone', 'Europe/London');

  const [marine, forecast] = await Promise.all([fetchJson(marineUrl), fetchJson(forecastUrl)]);

  return {
    wave: { time: marine.hourly.time, wave_height: marine.hourly.wave_height },
    seaTemperature: { time: marine.hourly.time, sea_surface_temperature: marine.hourly.sea_surface_temperature },
    wind: {
      time: forecast.hourly.time,
      wind_speed: forecast.hourly.wind_speed_10m,
      wind_direction: forecast.hourly.wind_direction_10m,
    },
    temperature: { time: forecast.hourly.time, temperature: forecast.hourly.temperature_2m },
    cloudCover: { time: forecast.hourly.time, cloud_cover: forecast.hourly.cloud_cover },
    daylight: forecast.daily
      ? { time: forecast.daily.time, sunrise: forecast.daily.sunrise, sunset: forecast.daily.sunset }
      : null,
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${url.hostname} returned ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
