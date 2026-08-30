# Spec: better day insights in the webapp

- **Author:** Raffi Jacobs (raffij@gmail.com)
- **Date:** 2026-08-30
- **Status:** Draft — for review
- **Stage:** 2 (Design). Reads [`webapp-day-insights.md`](webapp-day-insights.md).
  Feeds a later `webapp-day-insights.plan.md`.

## Summary

Add a **Day insights** block to the webapp, between the precipitation chart
and the day tiles. It renders, for whichever day the forecast picker has
selected:

1. a one-sentence characterisation of the day (wind shape + rain),
2. a **best window** line — the longest run of daylight hours with light
   wind and little/no rain,
3. a `·`-separated row of labelled values: next tide, wind, rain, sun.

All of it is computed on the client from data already fetched, plus two new
keyless daily fields (`sunrise`, `sunset`) added to the Open-Meteo Forecast
request the app already makes.

## Requirements

### Functional

- **F1 — Placement.** The block renders after the `PrecipitationChart`
  section and before the `ForecastList` section in `App.tsx`, wrapped in the
  existing `styles.section` spacing. No section heading text — the sentence
  is the heading.
- **F2 — Day scope.** The block reflects `referenceDate` / `isToday` from
  `App.tsx` (the same state the tide and precipitation charts already use).
  Selecting "Tomorrow" or a later day recomputes the sentence, the best
  window, and the values for that day.
- **F3 — Summary sentence.** A single line combining a **wind clause** and,
  when rain is expected in daylight hours, a **rain clause**. Examples:
  - "Calm this morning, wind building to ~22mph by mid-afternoon, rain
    likely from 16:00."
  - "Breezy all day, staying dry."
  - "Windy this morning, easing through the afternoon, rain clearing by
    14:00."
- **F4 — Best window.** The longest contiguous run of on-the-hour slots
  between sunrise and sunset where wind ≤ `MAX_COMFORTABLE_WIND_MPH` and
  (if precipitation data is present) that hour's total ≤ `WET_HOUR_MM`.
  Rendered as `09:00–13:00`. Rules:
  - Run length is `lastGoodHour + 1h − firstGoodHour`; a run must be
    ≥ `MIN_WINDOW_HOURS` to qualify.
  - Ties on length → earliest start wins.
  - When `isToday`, hours before the current hour are excluded. A run
    straddling "now" is trimmed to `[now, runEnd]` and labelled
    `now–15:00`. If the trimmed run has < `MIN_REMAINING_WINDOW_HOURS`
    left, it is discarded and the next qualifying run is considered.
  - No qualifying run → `{ kind: 'none' }`, rendered as "Conditions look
    marginal all day."
- **F5 — Values row**, in order, each entry dropped individually when its
  source data is missing:
  | Label | Value examples | Source |
  | --- | --- | --- |
  | Next tide | `High 14:32`, `Low 09:05` | `TideForecast.nextExtreme(referenceDate)` |
  | Wind | `Calm (~9mph)`, `Building to ~22mph`, `Easing` | `WindSeries` |
  | Rain | `From 16:00`, `None expected`, `Clearing by 14:00` | `PrecipitationSeries` |
  | Sun | `Sunset 20:14` (or `Sunrise 05:48` when `isToday` and now is before sunrise) | `DaylightSeries` |
- **F6 — Graceful degradation.**
  - Tide data is the essential base: the block renders whenever `series` is
    present. Next tide is always shown.
  - `windSeries`, `precipitationSeries`, `daylightSeries` are each
    independently optional. Missing wind **or** rain → that clause and that
    value entry are omitted. Missing both → sentence reads "Tide data only
    — wind and rain forecast unavailable."
  - Missing `daylightSeries` → best window falls back to a fixed
    `FALLBACK_DAY_START_HOUR`–`FALLBACK_DAY_END_HOUR` daytime range; the Sun
    value entry is omitted.
  - A wave/wind/precip/daylight outage must never surface as a blocking
    error (matches the existing deliberate swallowing of the wave-query
    error in `useForecastData`).

### Non-functional

- **N1 — No new API calls.** Only additive change upstream: `daily=sunrise,sunset`
  on the existing `https://api.open-meteo.com/v1/forecast` request. No new
  endpoint, no TideCheck impact (its 50/day budget is untouched).
- **N2 — Client compute.** Derivations run in a pure function
  (`buildDayInsights`) memoised in `App.tsx` on
  `[forecast, windSeries, precipitationSeries, daylightSeries, referenceDate, isToday]`.
- **N3 — Visual language.** Minimal, dark-first, low-chrome. Theme tokens
  only (`src/theme.ts`); no card border, no new hardcoded colours. The
  values row reuses `TideChart`'s `legendRow` / `legendText` styling for
  visual consistency.
- **N4 — Timezone.** Europe/London throughout, via `TideClock`.
- **N5 — Web build only.** No native modules; must work under
  `react-native-web`.
- **N6 — Accessibility.** Sentence and best-window line are single `Text`
  nodes; values row exposes a combined `accessibilityLabel`, matching the
  care already taken in `ForecastList`.

## Design

### Data flow

```
Open-Meteo Forecast call (WaveAPIClient.fetchWindAndPrecipitation)
  + daily=sunrise,sunset
        │
        ▼
WaveDataResult.daylight: DaylightData | null   ── cached alongside wind/precip
        │
        ▼
useForecastData → selectWave → WaveView.daylightSeries: DaylightSeries | null
        │
        ▼
ForecastData.daylightSeries  ──►  App.tsx
                                    │  useMemo
                                    ▼
                     buildDayInsights({ forecast, windSeries,
                       precipitationSeries, daylightSeries,
                       reference: referenceDate, isToday })
                                    │
                                    ▼
                          <DayInsights insights={…} />
```

### New modules

- **`src/services/DaylightSeries.ts`**
  ```ts
  export interface DaylightData { time: string[]; sunrise: string[]; sunset: string[]; }

  export class DaylightSeries {
    // Map<yyyy-MM-dd, { sunrise: Date | null; sunset: Date | null }>, zipped
    // from data.time[i] → parse(data.sunrise[i]) / parse(data.sunset[i]).
    sunrise(date: Date): Date | null;   // keyed on TideClock.dateKey(date)
    sunset(date: Date): Date | null;
  }
  ```
  Parses the `"2026-08-30T06:12"` strings with the new
  `TideClock.parseLondonWallTime` (see **Changed modules → TideClock**),
  so a viewer in any browser timezone gets the correct London instant.

- **`src/services/DayInsights.ts`** — pure logic + co-located tuning
  constants (matching how `STEADY_THRESHOLD_MPH` etc. live beside their
  series):
  ```ts
  export const MAX_COMFORTABLE_WIND_MPH = 16;   // ≈ Beaufort 4/5 boundary; above this a pier walk is unpleasant
  export const WET_HOUR_MM = 0.2;               // hourly precip total above this = "wet hour" for window scoring
  export const MIN_WINDOW_HOURS = 2;            // shorter runs aren't worth calling out
  export const MIN_REMAINING_WINDOW_HOURS = 1;  // today: if less than this remains, look past it
  export const WIND_BAND_BREEZY_MPH = 12;       // sentence bands: <12 calm, 12–24 breezy, ≥24 windy
  export const WIND_BAND_WINDY_MPH = 24;
  export const FALLBACK_DAY_START_HOUR = 7;     // used only when DaylightSeries is unavailable
  export const FALLBACK_DAY_END_HOUR = 21;

  export interface DayInsights {
    summarySentence: string;
    values: Array<{ label: string; value: string }>;
    bestWindow: { kind: 'window'; label: string } | { kind: 'none'; label: string };
  }

  export function buildDayInsights(input: {
    forecast: TideForecast;
    windSeries: WindSeries | null;
    precipitationSeries: PrecipitationSeries | null;
    daylightSeries: DaylightSeries | null;
    reference: Date;
    isToday: boolean;
  }): DayInsights;
  ```

- **`src/components/DayInsights.tsx`** — presentational, takes
  `{ insights: DayInsights }`. Layout top→bottom:
  1. `summarySentence` — `colors.textPrimary`, ~14px, `lineHeight` ~19.
  2. best-window line — `marginTop` 6, medium weight, `colors.textPrimary`,
     with a leading 7px dot in `colors.primary` (same dot as the chart
     legends). Text: `Best window: ${label}` or the `none` label verbatim.
  3. values row — `marginTop` 8, `flexWrap`, `·`-separated,
     `legendText` styling (`colors.textSecondary`, 11px, weight 600).

### Changed modules

- **`src/services/WaveAPIClient.ts`**
  - `fetchWindAndPrecipitation`: append `daily=sunrise,sunset`; read
    `json.daily`; return `daylight: json.daily ? { time, sunrise, sunset } : null`
    in the same result object. Any thrown error / non-ok response →
    `daylight: null` alongside the existing `wind: null, precipitation: null`.
  - `WaveDataResult` gains `daylight: DaylightData | null`.
  - `fetchAndCache` serialises `daylight`; `getCached` reads
    `daylight: daylight ?? null` (so pre-existing cache entries, which lack
    the field, keep decoding — they surface `daylight: null` until the next
    fetch; see C2).
  - **Cache key is not bumped.**

- **`src/services/TideClock.ts`** — add a London-wall-clock parser and route
  all Open-Meteo local-time parsing through it (C1):
  ```ts
  // Parses "yyyy-MM-ddTHH:mm[:ss]" with NO offset as Europe/London wall-clock
  // time, regardless of the host's timezone. Strings that already carry an
  // offset or trailing "Z" are handed to parseISODate unchanged.
  static parseLondonWallTime(value: string): Date | null;
  ```
  - Implementation: reuse the existing `offsetMillis` DST trick — build a
    `Date.UTC(...)` from the string's components, then subtract the London
    offset for that instant.
  - Reroute `WaveSeries`, `WindSeries`, and `PrecipitationSeries`
    constructors from `new Date(timeStr)` to
    `TideClock.parseLondonWallTime(timeStr)`; `DaylightSeries` uses it too.
  - **No-op for UK viewers**: on a browser already in `Europe/London` the
    helper must return the same instant as `new Date(str)` did. Non-UK
    viewers get corrected chart alignment as a side benefit (previously the
    hourly series were silently shifted by the host's offset).
  - TideCheck parsing (`TideSeries`, `TideForecast`) is unchanged — its
    timestamps carry an offset and already parse correctly via
    `parseISODate`.

- **`src/services/TideForecast.ts`** — add:
  ```ts
  nextExtreme(from: Date): Extreme | null {
    return this.extremes
      .filter((e) => {
        const t = TideClock.parseISODate(e.localTime);
        return t !== null && t.getTime() > from.getTime();
      })
      .sort((a, b) => a.localTime.localeCompare(b.localTime))[0] ?? null;
  }
  ```

- **`src/hooks/useForecastData.ts`**
  - `WaveView` gains `daylightSeries: DaylightSeries | null`; `selectWave`
    builds it (`result.daylight ? new DaylightSeries(result.daylight) : null`).
  - `ForecastData` gains `daylightSeries: DaylightSeries | null`;
    `combineForecastData` maps `wave.data?.daylightSeries ?? null`.

- **`src/App.tsx`**
  - Destructure `daylightSeries` from `useForecastData`.
  - `const insights = useMemo(() => (series ? buildDayInsights({ forecast, windSeries, precipitationSeries, daylightSeries, reference: referenceDate, isToday }) : null), [series, forecast, windSeries, precipitationSeries, daylightSeries, referenceDate, isToday]);`
  - Render `{series && insights && (<View style={styles.section}><DayInsights insights={insights} /></View>)}` immediately before the `ForecastList` section (after the `{error && …}` line).

### Algorithms

**Wind clause.**
`morningMean` = mean of `windSeries.speedAt(h)` for hours `[dayStart..12]`;
`afternoonMean` / `afternoonPeak` over `[13..dayEnd]`, where `dayStart` /
`dayEnd` are the daylight hour bounds (or the fallback range). Band each
mean by `WIND_BAND_*` into `calm | breezy | windy`.
- bands equal → `"${Band} all day"` (`Band` ∈ Calm/Breezy/Windy)
- afternoon band > morning band → `"${MorningBand} this morning, wind building to ~${round(afternoonPeak)}mph by mid-afternoon"`
- morning band > afternoon band → `"${MorningBand} this morning, easing through the afternoon"`

**Rain clause** (omitted entirely if `precipitationSeries` is null; judged
over `RAIN_WINDOW_START_HOUR`–`RAIN_WINDOW_END_HOUR` = 06:00–22:00, matching
`PrecipitationChart`'s own display span so the two can't disagree — **not**
the daylight window, which was the source of a "None expected" vs. visible
bars contradiction; see `plan.md`):
- `wet` = hours in that window with `mm > WET_HOUR_MM`
- `from` = `isToday ? reference : windowStart`; `upcoming` = `wet` hours not
  yet finished as of `from`
- `upcoming` empty → `"staying dry"` / `None expected`
- first upcoming hour is still ahead → `"rain likely from ${HH:MM}"` / `From ${HH:MM}`
- raining now, last upcoming hour ends by `windowEnd` → `"rain clearing by ${HH:MM}"` / `Clearing by ${HH:MM}`
- raining past `windowEnd` → `"rain on and off through the day"` / `On and off`

**Assembly.** `sentence = windClause + (rainClause ? ", " + rainClause : "") + "."`.
When `windSeries` is null, the rain clause (capitalised) stands alone. When
both are null: `"Tide data only — wind and rain forecast unavailable."`

**Best window.** As specified in F4. Candidate hours are every `:00` from
`ceil(sunrise)` to `floor(sunset)` inclusive; `good(h)` per F4; find maximal
runs; apply the `isToday` trimming; filter by `MIN_WINDOW_HOURS` /
`MIN_REMAINING_WINDOW_HOURS`; pick earliest longest; format
`HH:MM–HH:MM`, substituting `now` for the start when the run was trimmed to
the current hour. When nothing qualifies: `"Best window has passed for
today"` if `isToday` and some untrimmed run was `>= MIN_WINDOW_HOURS`
(a real window existed, it's just behind us), otherwise `"Conditions look
marginal all day"`.

**Values.**
- Next tide: `${e.type === 'high' ? 'High' : 'Low'} ${TideClock.format(parseISODate(e.localTime), { hour: '2-digit', minute: '2-digit', hour12: false })}`
- Wind: reuse the wind-clause band + `afternoonPeak`; `Building to ~22mph` /
  `Easing` / `${Band} (~${round(currentOrMeanMph)}mph)`
- Rain: `From 16:00` / `None expected` / `Clearing by 14:00`
- Sun: `isToday && reference < sunrise` → `Sunrise ${HH:MM}`, else
  `Sunset ${HH:MM}`

## Carried-forward questions — resolved here

| From intent "Still open" | Resolution in this spec |
| --- | --- |
| Actual threshold numbers | `MAX_COMFORTABLE_WIND_MPH = 16`, `WET_HOUR_MM = 0.2`, sentence bands at 12 / 24 mph. Three bands: calm / breezy / windy. Constants co-located in `DayInsights.ts`, tuned by editing. |
| Sentence templating rules | Wind clause + optional rain clause, assembled per **Algorithms** above, with explicit missing-data fallbacks. |
| Best-window shape | Single contiguous run, ≥ 2h to qualify. Non-contiguous ("…then again after 18:00") is explicitly **out of scope** for this iteration. |
| Past-time handling for today | Exclude past hours; trim a straddling run to `now–end`; discard if < 1h remains and look later; else "marginal all day". |

## Spec-review decisions (C1–C3)

- **C1 — Fix the browser-timezone assumption app-wide.** Add
  `TideClock.parseLondonWallTime` and route `WaveSeries`, `WindSeries`,
  `PrecipitationSeries`, and the new `DaylightSeries` through it (details
  under **Changed modules → TideClock**). This corrects a pre-existing
  latent bug: those three series currently parse Open-Meteo's offset-less
  local-time strings with `new Date(str)`, so for a viewer not on UK time
  the hourly charts were shifted by the host's offset. Must be a no-op for
  UK viewers. TideCheck parsing is untouched.
- **C2 — Do not bump the wave cache key.** Pre-existing cache entries stay
  valid and surface `daylight: null` until their next fetch; the best
  window uses the `FALLBACK_DAY_*` range in the meantime, and the 1-hour
  `STALE_REFRESH_MS` background top-up fills the field in well before the
  6h TTL. `getCached` must coalesce the missing field to `null`.
- **C3 — Manual QA only.** No test runner is added. The 10-case matrix
  below is the safety net; regressions in the heuristics won't be caught
  automatically. Keeping `buildDayInsights` / `DaylightSeries` /
  `TideForecast.nextExtreme` as pure, exported functions leaves the door
  open to adding `vitest` later without rework.

## Remaining assumption

- **Sentence quality is heuristic.** The templated prose will occasionally
  read a little flat ("Breezy all day, staying dry."). That's an accepted
  tradeoff for keeping it honest and dependency-free; no LLM or template
  service is in scope.

## Out of scope

- The iOS widget, macOS menu-bar script, macOS desktop widget (no shared
  code by design — `docs/architecture.md`).
- Non-contiguous best windows.
- User-adjustable thresholds / any settings UI.
- Activity profiles (swim / surf / fish weighting).
- Any new upstream field beyond `sunrise` / `sunset`.
- Changing TideCheck timestamp parsing (already correct).
- Adding a test runner (C3).

## QA / acceptance

Manual matrix (deployed web build, `expo start --web`):

1. **Calm dry day** → "Calm all day, staying dry."; a best window spanning
   most of daylight; Rain value `None expected`.
2. **Wind building** → "…wind building to ~Nmph by mid-afternoon"; best
   window sits in the morning.
3. **Afternoon rain** → rain clause "rain likely from HH:MM"; best window
   ends at/before that hour.
4. **Rain all day** → "rain on and off through the day"; best window likely
   `none` ("marginal all day").
5. **Overlay missing** (simulate Forecast API failure) → sentence "Tide
   data only …"; only the Next tide value shows; best window uses the
   `FALLBACK_DAY_*` range; no error banner.
5a. **Stale cache without daylight** (an entry cached before this change)
   → decodes fine, `daylight: null`, best window on the fallback range,
   Sun value hidden; the next background top-up populates it.
6. **Viewing "Tomorrow"** → all three parts recompute for tomorrow; "now"
   phrasing does not appear (only `isToday` uses it).
7. **Today, best window half elapsed** → label reads `now–HH:MM`.
8. **Today, best window fully past** → next qualifying run, or "marginal".
9. **Long summer day** (sunrise ~04:50) → best window can start before
   06:00; not clipped to the chart's 06:00 display bound.
10. **Light/dark theme toggle** → block restyles from theme tokens only;
    no hardcoded colours, no card border.
11. **Non-UK browser timezone** (devtools → set to `America/New_York`,
    reload) → tide/wave/wind/precip charts and sunrise/sunset all still
    align to London wall-clock; on `Europe/London` the rendered output is
    byte-identical to before this change (C1 no-op check).

Acceptance: all 11 pass; `npm run lint` (Biome) clean; no new console
warnings on web.
