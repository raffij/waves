# 2026-09-05. The Expo app checks bathing-water pollution status too, reusing the swim-card's unverified EA integration

- **Date:** 2026-09-05 (same day as, and after,
  [2026-09-05-beach-water-quality-flags.md](2026-09-05-beach-water-quality-flags.md))
- **Status:** Accepted

## Context

`tools/swim-card/` already fetches per-beach water-quality flags from the
Environment Agency's Bathing Water Quality open data
(`environment.data.gov.uk`), but that's a one-shot CLI outside the app the
user actually opens day to day. Asked to add water-pollution reports "to my
forecasts" — the Expo app's forecast screen, not the swim-card tool.

The same constraint from the swim-card decision still applies here: this
session's outbound network access is blocked to `environment.data.gov.uk`,
so the exact request/response shape can't be verified live. Rather than
re-litigate that tradeoff, this change **reuses the already-accepted
approach and its caveats** — same endpoint, same classification mapping,
same "never guess clear" rule — ported from a Node CLI script
(`beachQuality.mjs`) into an Expo/React Native client class that fits this
app's existing conventions.

## Decision

Add `expo/src/services/WaterQualityClient.ts`, wired into `useForecastData`
as a third independent query alongside tide and wave/wind (`useQueries`,
its own query key `['waterQuality', location.id]`, no API key needed):

- Queries the EA's Bathing Water Quality API by the **selected location's**
  lat/long (`Location.latitude`/`longitude` — Hastings Pier or Morecambe),
  not a fixed list of beaches like swim-card's `BEACH_SITES` — this app has
  one location active at a time, picked via the existing location toggle.
- Caches to AsyncStorage with the same 6h TTL and stale-on-failure shape
  `WaveAPIClient` already uses, keyed on `locationId-latitude-longitude` so
  an edited location can't serve another location's cached reading.
- **Never resolves ambiguity to `'clear'`**, the one non-negotiable rule
  carried over from the swim-card decision: a request failure, non-OK
  response, or unrecognized JSON shape all resolve to `'unknown'`, same as
  `beachQuality.mjs`.
- Surfaced in `CurrentLevelCard` as a small icon+text row (`WaterQualityRow`)
  between the location/updated-time header and the tide/wave/wind/sea stats
  — colored green/red/gray for clear/flagged/unknown using the theme's
  existing `rising`/`falling`/`textSecondary` colors, not new ones. Placed
  as its own row rather than a fifth `Stat`: a clear/flagged/unknown read
  isn't a number-plus-unit, and the reading doesn't vary by which forecast
  day is selected the way tide/wave/wind do.
- Rejected wiring this into `ForecastList`'s per-day rows: the EA
  classification is a current-conditions reading, not a forecast that
  varies by day, so it belongs with the other "right now" stats in
  `CurrentLevelCard`, not repeated down the day list.
- A query failure here is left out of `useForecastData`'s combined `error`
  (same treatment as a wave-query failure) — a EA outage should show
  `'unknown'` in the badge, not a scary error banner blocking the rest of
  the screen.

## Consequences

The app now shows a real (if unverified) water-quality reading for
whichever location is selected. Same follow-up as the swim-card decision:
whoever runs this for real needs to treat the first run as the actual
verification step against `environment.data.gov.uk`, and both
`WaterQualityClient.ts` and `beachQuality.mjs` will need the same fix if the
guessed request shape turns out wrong — worth fixing in one place and
porting to the other rather than diverging.

Not done here: sharing code between `WaterQualityClient.ts` and
`beachQuality.mjs`. This repo is deliberately built around independent,
hand-written clients (see `docs/architecture.md`) — the swim-card CLI is
outside that four-client system entirely, so a shared package would be a
new kind of coupling this repo has specifically avoided elsewhere. Living
with duplicated fetch/parse logic here is consistent with that choice, not
an oversight.

## Diagram

Updates both `docs/architecture/waves.architecture.json` (system map: the
Expo app's client now also calls a fourth external endpoint, EA Bathing
Water — a new `waterQuality` guided view, and a "Diverge" card bullet
noting only Expo does this) and `docs/architecture/webapp.architecture.json`
(inside the webapp: a new `WaterQualityClient` node alongside
`TideAPIClient`/`WaveAPIClient`, coordinated by the same `useForecastData`).
Both were redelivered via the Archify CLI at `--quality showcase`, and
`docs/architecture.png`/`docs/webapp-architecture.png` re-exported to match.
