# Intent: better day insights in the webapp

- **Author:** Raffi Jacobs (raffij@gmail.com)
- **Date:** 2026-08-30
- **Status:** Draft — for review
- **Stage:** 1 (Intent). Feeds a later `spec.md` under `intent/`.

## Problem

The webapp already fetches everything needed to describe a day at Hastings
Pier — the full tide curve, hourly wave height, wind, and precipitation —
but it only ever shows the raw material:

- three current readings (tide / wave / wind) with an up/down arrow,
- a tide chart from 06:00–22:00 with wave and wind drawn over it,
- a precipitation bar chart with a "next rain" label,
- a row of day tiles showing each day's tide high/low.

Nothing on the screen answers the question a person actually opens the app
with: **"what is today going to be like, and when is the good part of it?"**
To get that, you have to read three charts and do the synthesis in your
head — scan the wind line for the calm stretch, cross-reference it against
the rain bars, then check where the tide is at that time. The data is all
there; the reading of it is left entirely to the user.

## Proposed outcome

A new insights block, sitting **between the precipitation chart and the day
tiles**, that reads as the "so what" conclusion to the charts above it. It
gives an at-a-glance readout of the day in plain terms, derived from data
already on the client:

- **A one-line characterisation of the day** — e.g. "Calm this morning,
  wind building to ~22mph by mid-afternoon, rain likely from 16:00."
- **Structured labelled values beneath the sentence** — e.g.
  "Next tide: high 14:32 · Wind: building · Rain: from 16:00 · Sunset:
  20:14" — so the same facts are there in a form that's easy to keep
  honest.
- **The best window** — the daylight stretch with the most favourable
  combination of light wind and little/no rain, called out explicitly
  (e.g. "Best window: 09:00–12:00"). Tuned for "nice to be outside on the
  pier", not for any water activity.
- **Follows the forecast day picker.** Selecting "Tomorrow" (or any future
  day) recomputes the sentence, the values, and the best window for that
  day, the same way the tide and precipitation charts already reproject
  onto a selected day.
- Still honest when data is thin: if the wave/wind/precip overlay failed to
  load, the insights fall back to what the tide data alone supports (next
  tide, tide state) rather than disappearing or lying.

This is synthesis layered on top of the existing charts, not a replacement
for them, and fits the app's current minimal, dark-first, low-chrome style
(hairline dividers, no card borders, content over decoration).

## Affected users and systems

- **Users:** anyone using the deployed webapp (`expo/` built for web,
  served under `/waves`). Primary use is a quick "is now / today any good
  for going down to the pier" check.
- **In scope:** the Expo app's web build only.
  - `App.tsx` — the `selectedDateKey` / `referenceDate` state already drives
    the charts; it now also drives the insights block.
  - `expo/src/services/` — insight computation lives here, alongside the
    existing derived-data classes (`TideSeries`, `WaveSeries`, `WindSeries`,
    `PrecipitationSeries`, `TideForecast`, `TideClock`). Likely a new
    `DayInsights` (or similar) that takes the series + a reference date and
    returns the sentence parts, the labelled values, and the best window.
  - A new component to render the block, consistent with `CurrentLevelCard`
    / `PrecipitationChart` styling.
  - `WaveAPIClient` / the Open-Meteo Forecast call — add `sunrise` and
    `sunset` (daily) to the existing keyless request; thread them through
    `WaveDataResult` and a series/helper so the day can be bounded by
    daylight.
- **Out of scope:** the iOS widget, the macOS menu-bar script, and the
  macOS desktop widget. Per `docs/architecture.md` these share no code with
  the app by design; this work does not change that. If the insight logic
  proves useful there later, it is re-implemented per client, not shared.
- **Upstream APIs:** TideCheck (tides) and Open-Meteo (marine + forecast).
  The only upstream change is two extra daily fields on the Open-Meteo
  Forecast call, which needs no API key.

## Constraints

- **Compute on the client from data already fetched.** TideCheck's free
  tier is 50 requests/day, query retries are disabled, and clients cache
  for 6h. Insights must be derived from the tide/wave/wind/precip data the
  app already has in memory — not new per-view API calls.
- **The only upstream addition is `sunrise`/`sunset`** on the Open-Meteo
  Forecast request. No other new fields or endpoints.
- **Thresholds are fixed constants in code.** "Good" is defined by
  hard-coded cutoffs (e.g. wind below some mph, rain below some mm/h, within
  daylight), living in one constants file and tuned by editing it. No
  settings UI — the app has no settings surface today and this intent does
  not add one.
- **Graceful degradation.** Wave/wind/precip is treated as a non-essential
  overlay today (a wave-query error is deliberately swallowed so it can't
  block the tide UI). Insights must respect that: never turn a missing
  overlay into a blocking error; degrade to tide-only insights.
- **Timezone is Europe/London throughout.**
- **Visual language is fixed:** minimal, dark-first, low-chrome. The block
  must not reintroduce card chrome or section-heading clutter that recent
  work deliberately removed.
- **No native modules / no prebuild-only APIs** — it has to work in the
  `react-native-web` build.

## Decisions taken during intent review

| Question | Decision |
| --- | --- |
| Who is "best window" for? | Generic "nice to be outside" — wind + rain + daylight. Tide is reported, not scored. |
| Summary format | Both: a written sentence, with structured labelled values beneath it. |
| Day scope | Insights follow the forecast day picker and recompute for the selected day. |
| Thresholds | Fixed constants in code, one file, no settings UI. |
| Placement | Between the precipitation chart and the day tiles. |
| Daylight framing | Yes — add `sunrise`/`sunset` from Open-Meteo; use it to bound "best window" and mention sunset in the summary. |

## Still open (for `spec.md`)

1. **Actual threshold numbers** — the specific wind mph and rain mm/h
   cutoffs, and how many bands ("calm / breezy / windy") the sentence uses.
2. **Sentence templating rules** — how the parts are assembled and what
   happens at the edges (no rain all day, wind steady, data missing) so it
   never reads awkwardly.
3. **Best-window shape** — single contiguous stretch only, or allow "best
   window: 09:00–12:00, then again after 18:00"? Minimum useful length?
4. **Past-time handling for "today"** — when the best window is already
   half over, does it show the remaining part, the whole original window,
   or shift to "next good window"?
