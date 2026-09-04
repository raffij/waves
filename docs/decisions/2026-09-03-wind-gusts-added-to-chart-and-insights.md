# 2026-09-03. Wind gusts are added to the tide chart and the day-insights sentence

- **Date:** 2026-09-03
- **Status:** Accepted

## Context

The user asked for gust speed to appear on the chart, and to be featured in
the day-insights readout "if needed" — i.e. only when it actually adds
information beyond the sustained wind speed already shown.

Open-Meteo's Forecast API already carries `wind_gusts_10m` on the same
`api.open-meteo.com/v1/forecast` endpoint the app fetches `wind_speed_10m`
and `wind_direction_10m` from — the same situation decision [2026-09-03](2026-09-03-wind-direction-added-app-only.md) (wind
direction) found: no new upstream, just a new field on an existing fetch.

Considered and rejected:

- **A separate gust chart/axis.** Gust and sustained speed are the same
  physical quantity (mph, same instrument, same hour), not two signals like
  wind speed and rain. Folding gust into the wind chart's own y-axis
  (`windSpread = max(windMaxSpeed, gustMaxSpeed)`) keeps them comparable at a
  glance, the way TemperatureChart already plots real vs. "feels like" on one
  shared axis rather than two.
- **A dedicated `colors.gust` theme color** (three variants: dark/glass/
  poster). Rejected for the same reason TideChart's wave line already reuses
  `colors.rising` instead of getting its own color: gust is a peak reading of
  the same wind signal, not a distinct quantity, so it reuses `colors.wind`
  — dashed, thinner, and more transparent than the sustained-speed line, the
  same "same color, different weight" treatment TemperatureChart gives cloud
  cover relative to sun.
- **Always naming gust in the sentence whenever data exists.** The user
  explicitly said "if needed" — most days the gust reading sits close enough
  to the sustained peak (a couple of mph) that naming it separately would
  read as noise on top of a peak the sentence may already state. Added a
  `WIND_GUST_EXCESS_MPH = 10` floor: the gust clause only fires when the
  day's peak gust clears the day's peak sustained speed by at least that
  much, the same noise-floor pattern `WIND_DIRECTION_SHIFT_THRESHOLD_DEG` and
  `STEADY_THRESHOLD_MPH` already use elsewhere in this file.
- **Adding gust to `CurrentLevelCard`'s Wind stat or the three Swift
  clients.** Out of scope for what was asked (the chart and the day-insights
  sentence); `expo/` is where every past forecast feature has landed first
  (see [2026-09-03](2026-09-03-wind-direction-added-app-only.md)'s identical call), and the stat card has no spare column for a
  fifth reading without redesigning it.

## Decision

`WindData` gains an optional `wind_gusts` array (optional for the same
cache-compatibility reason `wind_direction` is — old `AsyncStorage` cache
entries without it still parse). `WaveAPIClient` requests `wind_gusts_10m`
in the same Forecast API call as `wind_speed_10m`/`wind_direction_10m`.

`WindSeries` gains `gustAt(date)`, sharing a new private `interpolateLinear`
helper with `speedAt` (the same pick-function pattern `TemperatureSeries`
already uses for `tempAt`/`feelsLikeAt`) — `directionAt` stays separate since
it needs circular interpolation instead. `samplesEvery` now returns
`{ time, speed, gust }` per sample instead of `{ time, speed }`.

`TideChart` plots a second, dashed wind-colored line for gust, scaled on the
same axis as sustained speed, with a "Gust up to Xmph" legend entry (a single
peak figure, not a range — a low gust reading is just a calm patch, not a
number worth reporting) and a `g` suffix in the scrub tooltip alongside the
existing `w`/`s`.

`DayInsights.ts`'s `windShape` gains `peak` (the day's highest sustained
speed) and `gustPeak` (the day's highest gust, `null` when gust data isn't
available). `windClause` appends a trailing ", gusting to Xmph" clause —
after the existing direction clause, on the same sentence — only when
`gustPeak - peak >= WIND_GUST_EXCESS_MPH`.

## Consequences

The tide chart and the day-insights sentence now surface gust speed when
it's genuinely higher than the sustained wind, everywhere `windSeries` was
already wired through (`App.tsx`'s live view and `ForecastList`'s per-day
summary). A `WindSeries` built from cached data that predates this change
(or a synthetic/preview series that doesn't set `wind_gusts`) degrades
gracefully: `gustAt` returns `null`, the chart draws no gust line/legend
entry, and `windShape.gustPeak` is `null` so the sentence falls back to its
pre-gust form. `CurrentLevelCard` and the three Swift clients are unchanged.

## Diagram

No diagram update is needed: `docs/architecture/` shows what each client
fetches from which upstream and how they relate, not the fields within one
existing fetch — this adds a field to an already-diagrammed edge (app →
Open-Meteo Forecast API), not a new component or connection.
