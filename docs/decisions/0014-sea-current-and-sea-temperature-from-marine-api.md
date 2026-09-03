# 0014. Surface sea current direction and sea surface temperature from Open-Meteo Marine

- **Date:** 2026-09-03
- **Status:** Accepted

## Context

A user going swimming wants to know which way the current is running and how
cold the water actually is, not just the wave height and air temperature the
app already showed. `WaveAPIClient.ts` already calls Open-Meteo's Marine API
for `wave_height`; that same endpoint also offers `ocean_current_direction`,
`ocean_current_velocity`, and `sea_surface_temperature` for the same
lat/lon/date range, at no extra cost (same request, no new API key). There
was no sea-water-temperature reading anywhere in the app before this — what's
labelled "temperature" elsewhere is air temperature (`temperature_2m` from
the separate Forecast API).

## Decision

Add `ocean_current_direction,ocean_current_velocity,sea_surface_temperature`
to `WaveAPIClient.ts`'s existing marine `hourly` request, and thread the
results through the app following the established one-concern-per-interface
pattern (`WeatherModels.ts` → dedicated `*Series` class → `useForecastData`
→ components), same as `WindData`/`TemperatureData` already do:

- `SeaCurrentData` (`SeaCurrentSeries`) and `SeaTemperatureData`
  (`SeaTemperatureSeries`) are new, separate model/series pairs rather than
  folding into `WaveData`/`WaveSeries` — the convention in this codebase is
  one interface/Series per concern regardless of which endpoint it came from
  (wind, precipitation, temperature, sun, cloud all come from the *same*
  Forecast API call yet each gets its own type and Series).
- Current direction is looked up by nearest-sample (`directionAt`), not
  linearly interpolated like every other reading in this codebase —
  averaging two compass bearings across the 0°/360° wrap (e.g. 350° and 10°)
  produces a meaningless midpoint, unlike averaging a wave height or wind
  speed.
- Surfaced where a swimmer actually looks: the "now" card (`CurrentLevelCard`)
  gains a Sea-temperature stat alongside Tide/Wave/Wind, plus a compass-arrow
  row ("Current flowing SW at 1.2km/h") rotated to the live bearing. The
  per-day forecast list (`ForecastList`) gains a "Sea X–Y°C" range next to
  Tide's, for looking ahead.
- Current direction was deliberately kept out of `DayInsights.ts` and the
  per-day forecast list — that file's own header comment already states it's
  "a walk-on-the-pier judgement... not a water-sports one" and tide is
  "reported but never scored"; a swim-specific reading has no business
  entering the clothing-advice sentence. Sea temperature's day range was
  added to the forecast list's plain stats line instead, alongside Tide/Wind,
  not into the scored insight.

Considered adding a full historical chart (like `TemperatureChart`) for sea
temperature and current velocity. Rejected for now: the ask was a
point-in-time "should I swim right now" reading, which the "now" card already
answers; a chart can follow later if it turns out to be wanted.

Considered mirroring this into the two Swift widget targets
(`expo/targets/widget/Widget.swift`, `mac-widget/.../WaveHastingsFetcher.swift`).
Rejected: those widgets are deliberately minimal today — they show only
tide/wave/wind and don't display air temperature, sun, cloud, or
precipitation either, despite the main app having all of them. Adding sea
temperature/current there would be new scope for the widgets specifically,
not a parity gap this change introduces. Same call as
[0013](0013-wind-direction-added-app-only.md) made for wind direction, which
landed on `main` while this branch was in flight: app-only, widgets
untouched.

## Consequences

Answers "should I swim right now" with the two extra facts that matter for
it, at no new API cost. `AsyncStorage`-cached `WaveDataResult` entries written
before this change lack `seaCurrent`/`seaTemperature` — read back as
`undefined` and coalesced to `null`, same handling as every prior field added
to that cache (`daylight`, `temperature`, `sunBrightness`, `cloudCover`), so
old cache entries don't need a version bump or migration; the next fetch (or
the hook's 1h stale top-up) fills them in.

Follow-up, not done here: a sea-temperature/current chart, and the same
fields in the Swift widgets, if either turns out to be wanted.

## Diagram

No diagram impact. `docs/architecture/webapp.architecture.json` already has
`waveClient` (`WaveAPIClient`) and `marineAPI` (`Open-Meteo Marine`) as
existing nodes with an existing edge between them — this change adds fields
to that same request, not a new component or connection.
