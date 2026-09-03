// Raw Open-Meteo response shapes — the wave/wind/rain/temperature/sun/cloud
// counterpart to TideModels.ts's TideCheck shapes. Each Series class (in
// services/) wraps one of these into interpolation/lookup behavior.

export interface WaveData {
  time: string[];
  wave_height: (number | null)[];
}

// Ocean current at the sea surface. Direction is in the oceanographic
// convention Open-Meteo uses — degrees the current is flowing TOWARD — the
// opposite sense from wind direction (which is where it's blowing FROM).
// Velocity is km/h.
export interface SeaCurrentData {
  time: string[];
  ocean_current_direction: (number | null)[];
  ocean_current_velocity: (number | null)[];
}

// Sea surface temperature, °C — distinct from TemperatureData below, which
// is air temperature.
export interface SeaTemperatureData {
  time: string[];
  sea_surface_temperature: (number | null)[];
}

export interface WindData {
  time: string[];
  wind_speed: (number | null)[];
  // Degrees, meteorological convention (the direction the wind is blowing
  // FROM, clockwise from true north — 0/360 = north, 90 = east). Absent from
  // WindData cached before this field was added, so callers treat a missing
  // array the same as an all-null one rather than assuming it's present.
  wind_direction?: (number | null)[];
}

export interface PrecipitationData {
  time: string[];
  precipitation: (number | null)[];
}

// Real (temperature_2m) and "feels like" (apparent_temperature, which factors
// in wind chill and humidity) air temperature, °C.
export interface TemperatureData {
  time: string[];
  temperature: (number | null)[];
  apparent_temperature: (number | null)[];
}

// Shortwave (solar) radiation reaching the ground, W/m² — how bright/strong
// the sun actually is, already discounted for cloud cover, unlike a raw UV
// index which ignores it.
export interface SunBrightnessData {
  time: string[];
  shortwave_radiation: (number | null)[];
}

// Total sky cloud cover, % (0–100) — the direct read of what the sky looks
// like, independent of the sun's elevation/season. Brightness alone can't
// tell a bright, fully overcast sky (thin high cloud still passes plenty of
// diffuse light) from real sun, so the two are read together.
export interface CloudCoverData {
  time: string[];
  cloud_cover: (number | null)[];
}

// One entry per day (time is a "yyyy-MM-dd" key), sunrise/sunset as local
// ISO strings for that day.
export interface DaylightData {
  time: string[];
  sunrise: string[];
  sunset: string[];
}
