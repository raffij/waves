# 0005. Weather response shapes live in `models/`, not in `WaveAPIClient.ts`

- **Date:** 2026-09-01
- **Status:** Accepted

## Context

`src/models/TideModels.ts` already held the TideCheck response shapes
(`SeriesPoint`, `Extreme`, `TideResponse`), imported by `TideAPIClient.ts`,
`TideSeries.ts` and `TideForecast.ts`. But the equivalent Open-Meteo response
shapes — `WaveData`, `WindData`, `PrecipitationData`, `TemperatureData`,
`SunBrightnessData`, `CloudCoverData`, `DaylightData` — were defined inline in
`src/services/WaveAPIClient.ts` instead. Every one of the seven `*Series`
classes that wraps one of these (`WaveSeries`, `WindSeries`,
`PrecipitationSeries`, `TemperatureSeries`, `SunBrightnessSeries`,
`CloudCoverSeries`, `DaylightSeries`) had to import its own data shape from a
service file rather than a model file, and `WaveAPIClient.ts` did double duty
as both "fetch + cache Open-Meteo data" and "define what Open-Meteo data
looks like" — the same file holding the plumbing and the plain data
contracts that plumbing (and six unrelated `*Series` classes) depend on.

## Decision

Move the seven response-shape interfaces into a new `src/models/
WeatherModels.ts`, alongside `TideModels.ts`. `WaveAPIClient.ts` now imports
them like everything else does, rather than being their source.

`WaveDataResult` (the client's own cache-wrapper shape — the response data
plus a `fetchedAt`) stays in `WaveAPIClient.ts`, matching `TideDataResult`'s
placement in `TideAPIClient.ts`: that shape is an artifact of the client's
own caching, not something the upstream API returned, so it belongs with the
client rather than the models.

Considered leaving it as-is: the interfaces were already exported and
working, and nothing was actually broken. Rejected because it left the one
established convention in this codebase (Tide's model/service split)
unfollowed by every other data source, for no reason other than history —
new readers hit `import type { WaveData } from './WaveAPIClient'` in six
different service files and had no reason to expect a fetch client to be the
place a plain data shape lives.

## Consequences

Makes it easier to find "what shape is this weather data" without first
finding "who happens to fetch it" — and keeps that consistent with how Tide
already works, so the pattern only needs learning once. No behavior changes;
this is a type-location move only, confirmed by `tsc --noEmit` and
`biome check` passing unchanged.

Two smaller renames rode along, same motivation (make an existing name say
what it is, no behavior change):

- `services/DayInsights.ts`'s exported `DayInsights` interface (just
  `{ summary: string }`) is now `DayInsightsReadout` — it collided with the
  `DayInsights` *component* that renders it, forcing an `as DayInsightsModel`
  import alias at the one call site. The new name also matches the file's
  own internal `buildReadout()` terminology.
- `components/ForecastList.tsx`'s `export type { ForecastWindow }` — a
  re-export of a type actually owned by `services/DayWindow.ts` — is
  deleted. Nothing imported it from `ForecastList`; both `App.tsx` and
  `App.preview.tsx` already imported `ForecastWindow` straight from
  `DayWindow.ts`.

## Diagram

No diagram impact. `docs/architecture/webapp.architecture.json` represents
`services/` at the granularity of "Series & Day Insights" as one box and
doesn't render `models/` as its own node at all — this change doesn't add,
remove, or rewire a component at that zoom level, only moves plain type
definitions between two files already inside the existing `services/`
boundary region's neighborhood.
