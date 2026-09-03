# 0012. Wind direction is added to the app only, with a backing/veering readout

- **Date:** 2026-09-03
- **Status:** Accepted

## Context

The user asked for wind direction alongside the existing wind speed, and
for the day-insights readout to say how it changes across the day, the
same way the readout already covers wind speed's morning/afternoon shape
(the `windClause`/`windShape` machinery) and, as of decision 0011, how a
rain spell's intensity changes across its span.

Open-Meteo's Forecast API already carries `wind_direction_10m` on the same
endpoint the app fetches `wind_speed_10m` from, so no new upstream is
needed — just a new field on an existing fetch.

Considered and rejected:

- **Adding direction to all four clients in one PR.** The repo is built
  around four *independent* client implementations that duplicate the same
  data shape rather than sharing fetch/parsing code (see root `README.md`,
  "Design"), and every past feature PR (clothing advice, rain intensity
  trend, sun bands, …) has landed in `expo/` alone, then left the other
  three clients to pick it up separately if and when they do. Widening this
  one PR to also touch `targets/widget/Widget.swift`,
  `mac-widget/wave-hastings.15m.swift`, and `mac-widget/DesktopWidget/`
  would triple the surface for what the user actually asked about (the
  app's current-conditions stat and its day-insights sentence) and break
  from that established one-client-per-PR pattern. The three Swift clients
  keep showing wind speed only until someone does that work in a follow-up.
- **A 16-point compass (e.g. "SSW", "WNW")** for the reported direction.
  Forecast wind direction already wanders a few degrees hour to hour; naming
  it to 16 points reads as more precision than the data actually supports.
  Settled on 8 points (N/NE/E/SE/S/SW/W/NW), matched by a
  `WIND_DIRECTION_SHIFT_THRESHOLD_DEG = 45` noise floor before the sentence
  calls a morning-to-afternoon change a shift at all — the same "don't
  manufacture a trend out of noise" rule `FEELS_TREND_THRESHOLD_C` and
  `STEADY_THRESHOLD_MPH` already apply to temperature and wind speed.
- **A linear mean/interpolation of the raw degrees.** Direction is circular
  (350° and 10° are 20° apart, not 340°), so a plain average or lerp would
  misread any spell that crosses due north. `WindSeries` instead
  interpolates along the shorter arc (`angularDelta`) and averages multiple
  readings as unit vectors (`circularMean`), both exported for
  `DayInsights.ts` to reuse rather than reimplement.
- **"Backing"/"veering" vs. plain English ("shifting left/right").** Kept
  the actual meteorological/sailing terms — this is a forecast for people
  checking conditions before going out on a pier, the same audience the
  existing "mid-afternoon", "wet hour" and tidal-extreme language already
  assumes knows the domain.

## Decision

`WindData` gains an optional `wind_direction` array (optional so old
`AsyncStorage` cache entries without it still parse — same coalescing
pattern `WaveAPIClient.getCached` already uses for `daylight`/
`temperature`/etc.). `WaveAPIClient` requests `wind_direction_10m` in the
same Forecast API call as `wind_speed_10m`.

`WindSeries` adds `directionAt(date)` (circular interpolation),
`compassPointFor(degrees)` (8-point compass), `circularMean(degrees[])` and
`angularDelta(a, b)`. `CurrentLevelCard`'s Wind stat appends the compass
point to the unit ("8.4 `mph SW`") rather than adding a fourth stat column.

`DayInsights.ts`'s `windShape` now also carries a circular-mean direction
for the morning and afternoon halves of the window; `windClause` appends a
trailing phrase to the existing wind sentence — "from the southwest" when
the shift is under the noise threshold, "backing from southwest to south"
/ "veering from southwest to west" when it isn't — rather than a separate
sentence, since speed and direction are one signal to someone deciding
what to wear or which way to face, not two.

## Consequences

The app's current-conditions card and day-insights sentence now report
wind direction and how it moves through the day; the three Swift clients
are unchanged and still show speed only — a known gap, not an oversight,
per the "app only" call above. A `WindSeries` built from cached data that
predates this change (or from a synthetic/preview series that doesn't set
`wind_direction`) degrades gracefully: `directionAt` returns `null`,
`windShape.direction` is `null`, and the sentence and stat both fall back
to their pre-direction form rather than throwing.

## Diagram

No diagram update is needed: `docs/architecture/` shows what each client
fetches from which upstream and how they relate, not the fields within one
existing fetch — this adds a field to an already-diagrammed edge
(app → Open-Meteo Forecast API), not a new component or connection.
