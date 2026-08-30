# Plan: better day insights in the webapp

- **Author:** Raffi Jacobs (raffij@gmail.com)
- **Date:** 2026-08-30
- **Status:** Draft — for review
- **Stage:** 3 (Build planning). Reads
  [`webapp-day-insights.spec.md`](webapp-day-insights.spec.md).
- **Rule:** if implementation departs from this plan, update this file in
  the same commit.

## Approach

Build bottom-up so every step type-checks in isolation and can be verified
before the next is layered on. The C1 timezone fix (steps 1–2) is a
self-contained bugfix landed and checked **first** — its acceptance bar is
"no-op on `Europe/London`" — so any regression there surfaces before the
feature sits on top of it.

All paths below are under `expo/`.

| # | Step | Files |
| --- | --- | --- |
| 1 | `TideClock.parseLondonWallTime` | `src/services/TideClock.ts` |
| 2 | Reroute Open-Meteo series parsing | `src/services/WaveSeries.ts`, `WindSeries.ts`, `PrecipitationSeries.ts` |
| 3 | `daily=sunrise,sunset` on the Forecast call | `src/services/WaveAPIClient.ts` |
| 4 | `DaylightSeries` | `src/services/DaylightSeries.ts` (new) |
| 5 | `TideForecast.nextExtreme` | `src/services/TideForecast.ts` |
| 6 | Wire `daylightSeries` through the hook | `src/hooks/useForecastData.ts` |
| 7 | `buildDayInsights` + constants | `src/services/DayInsights.ts` (new) |
| 8 | `DayInsights` component | `src/components/DayInsights.tsx` (new) |
| 9 | Mount in the screen | `App.tsx` |
| 10 | Lint + manual QA matrix | — |

---

## Step 1 — `TideClock.parseLondonWallTime`

**File:** `src/services/TideClock.ts`

Add a static method beside `parseISODate`:

```ts
// Parses "yyyy-MM-ddTHH:mm[:ss]" that carries NO timezone offset as
// Europe/London wall-clock time, regardless of the host timezone. A string
// that already has an offset or trailing "Z" is passed through to
// parseISODate unchanged.
static parseLondonWallTime(value: string): Date | null {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return TideClock.parseISODate(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return TideClock.parseISODate(value);
  const [, y, mo, d, h, mi, s] = m;
  const asUTC = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  // Two-pass: offsetMillis needs an instant near the target day. The first
  // guess is off by at most the London offset; re-evaluating the offset at
  // that guess is exact except inside the ~1h DST transition window.
  const guess = new Date(asUTC);
  const offset = TideClock.offsetMillis(guess);
  return new Date(asUTC - offset);
}
```

`offsetMillis` is currently `private` — it stays private (same file).

**Verify:** in a browser console on `Europe/London`,
`TideClock.parseLondonWallTime('2026-08-30T06:00').getTime() ===
new Date('2026-08-30T06:00').getTime()`. Re-check with devtools timezone set
to `America/New_York`: the value is unchanged (still London 06:00), whereas
`new Date('2026-08-30T06:00')` shifts by 5h.

---

## Step 2 — Reroute Open-Meteo series parsing

**Files:** `src/services/WaveSeries.ts`, `src/services/WindSeries.ts`,
`src/services/PrecipitationSeries.ts`

Each constructor maps its `data.time[]` with `new Date(timeStr)`. Change to
`TideClock.parseLondonWallTime(timeStr) ?? new Date(NaN)` (all three files
already import `TideClock`). The `?? new Date(NaN)` keeps array indices
aligned with the value arrays and matches the existing tolerance for bad
points (every consumer already null-checks the paired value).

No other lines change — `mmAt` / `heightAt` / `speedAt` build `Date`s from
arguments, not from strings.

**Verify:** on `Europe/London` the tide/wave/wind/precip charts render
identically to `main` (diff screenshots or eyeball). This is the C1 no-op
gate.

---

## Step 3 — `daily=sunrise,sunset` on the Forecast call

**File:** `src/services/WaveAPIClient.ts`

1. New exported type:
   ```ts
   export interface DaylightData { time: string[]; sunrise: string[]; sunset: string[]; }
   ```
2. `WaveDataResult` gains `daylight: DaylightData | null`.
3. `fetchWindAndPrecipitation` (extend the leading comment to mention the
   daily fields):
   - `url.searchParams.append('daily', 'sunrise,sunset');`
   - widen the parsed response type with
     `daily?: { time: string[]; sunrise: string[]; sunset: string[] }`
   - return `{ wind, precipitation, daylight }`, where
     `daylight = json.daily ? { time: json.daily.time, sunrise: json.daily.sunrise, sunset: json.daily.sunset } : null`
   - the non-ok branch and the `catch` return
     `{ wind: null, precipitation: null, daylight: null }`
4. `fetch()` — destructure `{ wind, precipitation, daylight }` and pass
   `daylight` into the returned `WaveDataResult`.
5. `fetchAndCache` — add `daylight: result.daylight` to the `JSON.stringify`
   payload.
6. `getCached` — destructure `daylight` and return
   `daylight: daylight ?? null` (**C2**: entries cached before this change
   omit the field and must still decode).
7. **Cache key unchanged** (C2).

**Verify:** network tab shows `&daily=sunrise,sunset` on
`api.open-meteo.com/v1/forecast`; the response's `daily` block is retained.
Load with a pre-existing cache entry (edit one in Application → Storage to
drop `daylight`) → no throw, `daylight` resolves to `null`.

---

## Step 4 — `DaylightSeries`

**File:** `src/services/DaylightSeries.ts` (new)

```ts
import { TideClock } from './TideClock';
import type { DaylightData } from './WaveAPIClient';

export class DaylightSeries {
  private readonly byDate = new Map<string, { sunrise: Date | null; sunset: Date | null }>();

  constructor(data: DaylightData) {
    data.time.forEach((dateKey, i) => {
      this.byDate.set(dateKey, {
        // daily `time` entries are already "yyyy-MM-dd" — used verbatim as
        // the key; only the sunrise/sunset instants need parsing.
        sunrise: data.sunrise[i] ? TideClock.parseLondonWallTime(data.sunrise[i]) : null,
        sunset: data.sunset[i] ? TideClock.parseLondonWallTime(data.sunset[i]) : null,
      });
    });
  }

  sunrise(date: Date): Date | null {
    return this.byDate.get(TideClock.dateKey(date))?.sunrise ?? null;
  }
  sunset(date: Date): Date | null {
    return this.byDate.get(TideClock.dateKey(date))?.sunset ?? null;
  }
}
```

**Verify:** exercised via step 7 / QA. Spot-check
`daylightSeries.sunset(new Date())` against a known value for Hastings.

---

## Step 5 — `TideForecast.nextExtreme` (+ `TideSeries` parsing)

**File:** `src/services/TideForecast.ts`

Add (the file already imports `TideClock`):

```ts
nextExtreme(from: Date): Extreme | null {
  return this.extremes
    .filter((e) => {
      const t = TideClock.parseLondonWallTime(e.localTime);
      return t !== null && t.getTime() > from.getTime();
    })
    .sort((a, b) => a.localTime.localeCompare(b.localTime))[0] ?? null;
}
```

**Departure from the spec.** The spec said TideCheck parsing was already
correct and would be left alone. The Swift clients tell a different story:
their `parseISODate` has a **London-zoned fallback** for offset-less
`yyyy-MM-ddTHH:mm` strings (`Widget.swift`, `TideClock.swift`), i.e.
TideCheck's `localTime` can be local-naive. So:

- `nextExtreme` parses with `parseLondonWallTime`, not `parseISODate`.
- `TideSeries`'s constructor (`src/services/TideSeries.ts`) switches its
  `parseISODate(p.time)` to `parseLondonWallTime(p.time)` too.

`parseLondonWallTime` is a safe superset — it delegates to `parseISODate`
whenever an offset/`Z` is present, and only changes behaviour for
offset-less strings on a non-UK browser (exactly the C1 bug). This makes
C1 complete: no browser-timezone-dependent timestamp parsing anywhere in
the app.

**Verify:** "Next tide" value matches the next crossing on the tide chart;
after that extreme's time passes, it advances to the following one. Tide
chart itself unchanged on `Europe/London`.

---

## Step 6 — Wire `daylightSeries` through the hook

**File:** `src/hooks/useForecastData.ts`

- `import { DaylightSeries } from '../services/DaylightSeries';`
- `interface WaveView` gains `daylightSeries: DaylightSeries | null`.
- `selectWave`: `daylightSeries: result.daylight ? new DaylightSeries(result.daylight) : null`.
- `interface ForecastData` gains `daylightSeries: DaylightSeries | null`.
- `combineForecastData`: `daylightSeries: wave.data?.daylightSeries ?? null`.

No change to query keys, `enabled`, or `refresh()` — daylight rides the
existing wave query.

**Verify:** `tsc` clean; `daylightSeries` is defined in `App` after a
successful wave fetch, `null` after a simulated Forecast failure.

---

## Step 7 — `buildDayInsights` + constants

**File:** `src/services/DayInsights.ts` (new)

Constants and the `DayInsights` / `buildDayInsights` signatures are quoted
verbatim in **spec → Design → New modules**. Branch logic is
**spec → Design → Algorithms**. Implementation specifics for this plan:

- **Daylight bounds as Dates, not float hours.** Iterate `h` from `0..23`
  (or `FALLBACK_DAY_START_HOUR..FALLBACK_DAY_END_HOUR` when
  `daylightSeries` is null or has no entry for the day),
  `slot = TideClock.londonDateAtHour(reference, h)`, and keep the slot when
  `daylightSeries` is null **or** `sunrise <= slot <= sunset`. Avoids
  extracting hour-of-day from a Date.
- **Morning / afternoon split:** morning = kept slots with `h <= 12`,
  afternoon = `h >= 13`. Means over `windSeries.speedAt(slot)` ignoring
  `null`. `afternoonPeak = Math.max(...)`, `Math.round` for display.
- **Bands:** `mph < WIND_BAND_BREEZY_MPH` → `calm`; `< WIND_BAND_WINDY_MPH`
  → `breezy`; else `windy`. Word = capitalised band.
- **Best window run length** = `lastGoodHour + 1 − firstGoodHour` (hours);
  qualify at `>= MIN_WINDOW_HOURS`. `isToday` trims leading slots earlier
  than `reference`'s hour; a run trimmed at the front is labelled
  `now–HH:MM`; if the trimmed run has `< MIN_REMAINING_WINDOW_HOURS` left,
  drop it and take the next qualifier; none → `{ kind: 'none', label: 'Conditions look marginal all day' }`.
- **Time formatting:** `TideClock.format(d, { hour: '2-digit', minute: '2-digit', hour12: false })`.
- **`nextRainAfter` day-guard:** keep the result only when
  `TideClock.dateKey(firstRain) === TideClock.dateKey(reference)`.
- Pure module, no React imports — keep it that way (leaves `vitest` as a
  no-rework future option, per spec C3).

**Verify:** via the QA matrix (step 10). No unit tests (C3).

---

## Step 8 — `DayInsights` component

**File:** `src/components/DayInsights.tsx` (new)

- `export function DayInsights({ insights }: { insights: DayInsightsModel })`
  — import the result type from the service (alias to avoid the name clash
  with the component, e.g. `import type { DayInsights as DayInsightsModel }`).
- `useTheme()` + `const styles = useMemo(() => getStyles(colors), [colors])`,
  mirroring `PrecipitationChart`.
- Layout:
  1. `<Text style={styles.sentence}>{insights.summarySentence}</Text>` —
     `colors.textPrimary`, `fontSize: 14`, `lineHeight: 19`.
  2. Best-window row: `flexDirection: 'row'`, a 7px `borderRadius: 4` dot in
     `colors.primary`, then
     `<Text style={styles.window}>{label}</Text>` — `marginTop: 6`,
     `fontSize: 13`, `fontWeight: '600'`, `colors.textPrimary`. For
     `kind: 'window'` prefix `Best window: `; for `kind: 'none'` render the
     label as-is (no dot).
  3. Values row: `flexDirection: 'row'`, `flexWrap: 'wrap'`,
     `columnGap: 10`, `rowGap: 2`, `marginTop: 8`. One `<Text>` per entry
     using the `legendText` treatment (`colors.textSecondary`,
     `fontSize: 11`, `fontWeight: '600'`) rendered as `${label} ${value}`,
     with a dim `·` `<Text>` between entries. Container gets
     `accessibilityLabel={insights.values.map(v => \`${v.label} ${v.value}\`).join(', ')}`.
- No card border, no background, no heading text.

**Verify:** QA cases 1 and 10.

---

## Step 9 — Mount in the screen

**File:** `App.tsx`

- Imports: `import { DayInsights } from './src/components/DayInsights';`
  and `import { buildDayInsights } from './src/services/DayInsights';`
  (`useMemo` is already imported).
- Destructure `daylightSeries` from the `useForecastData(apiKey, location)`
  result (the line currently pulling `series, forecast, waveSeries, …`).
- **Departure from the spec (and from this plan's first draft).** No
  `useMemo`. `AppContent` has early `return`s (the `apiKey` / `location`
  guards) *above* the point where `referenceDate` / `isToday` are known, so
  a hook there would break rules-of-hooks. `insights` is a plain expression,
  computed inline right after `windTrend`, exactly like the sibling
  `current` / `waveHeight` / `days` derived values:
  ```ts
  const insights =
    series && forecast
      ? buildDayInsights({ forecast, windSeries, precipitationSeries, daylightSeries, reference: referenceDate, isToday })
      : null;
  ```
  Cost is a handful of hourly lookups per render — negligible at this app's
  size, and the screen re-renders rarely (theme toggle, day select,
  refetch). Spec N2's memoisation requirement is dropped.
- Render, immediately after the `{error && <Text …>}` line and before the
  `<View style={styles.section}><ForecastList … /></View>`:
  ```tsx
  {insights && (
    <View style={styles.section}>
      <DayInsights insights={insights} />
    </View>
  )}
  ```

**Verify:** full QA matrix (step 10).

---

## Step 10 — Lint + manual QA

```bash
cd expo && npm run lint
```

Fix formatting with `npm run lint:fix` if Biome asks. Then:

```bash
cd expo && npm run web
```

Walk **spec → QA / acceptance**, cases 1–11 (including 5a stale-cache and
11 non-UK timezone). Acceptance: all pass, Biome clean, no new console
warnings.

**Status after implementation:**

- `biome check .` — clean across all 39 files.
- `tsc --noEmit -p tsconfig.json` — clean (no output, exit 0) once
  dependencies were installed.
- `expo start --web` — bundles clean (431 modules, no errors); no console
  errors in the running app.
- **Runtime checks passed** (deployed web build, real cached data for
  Hastings Pier):
  - Block renders between the precipitation chart and the day tiles, no
    card chrome, sentence + best-window line + `·`-separated values.
  - **Today** (~17:20): "Calm all day, rain likely from 18:00." · values
    "Next tide Low 20:09 · Wind Calm (~11mph) · Rain From 18:00 · Sun
    Sunset 19:48".
  - **Tomorrow**: recomputes — "Breezy this morning, easing through the
    afternoon, staying dry." · "Best window: 07:00–20:00" (real window, no
    "now" phrasing) · "Wind Easing".
  - Light and dark themes both restyle correctly from theme tokens.
  - Open-Meteo request carries `daily=sunrise,sunset`; the parsed
    `daylight` block is present in the wave-cache entry
    (`sunrise0: "2026-08-29T06:06"`, `sunset0: "2026-08-29T19:50"`).
  - **C2**: a pre-existing wave-cache entry with no `daylight` field
    decodes without error (`daylight` resolves to `null`).
- **Not verified at runtime:** QA case 11 (non-UK browser timezone) — no
  timezone override available through the browser tooling used. The
  `parseLondonWallTime` path is exercised on `Europe/London` (no-op
  confirmed: charts unchanged); the non-UK correction is reasoned, not
  runtime-checked.

**Rough edges found in that runtime pass — both fixed:**

1. On **today**, once "now" was past the last good daylight hour, the best
   window read "Conditions look marginal all day" next to a "Calm all day"
   sentence. Fixed: when a run of `>= MIN_WINDOW_HOURS` existed earlier
   today but nothing qualifies now, the label is **"Best window has passed
   for today"**. Verified at ~18:00: "Calm all day, rain on and off through
   the day." · "Best window has passed for today".
2. **Rain "None expected"** contradicted the precipitation chart when rain
   fell outside the old daylight-only window. Fixed: `rainInfo` now judges
   rain over `RAIN_WINDOW_START_HOUR`–`RAIN_WINDOW_END_HOUR` (06:00–22:00),
   matching `PrecipitationChart`'s own span so the two can't disagree, and
   for a non-today view it searches from the window start (not the first
   daylight slot). Verified on Tomorrow: chart "3.7 mm total, next rain
   06:00" now yields "rain clearing by 07:00" / "Clearing by 07:00".

Re-checked after the fixes: Biome clean, `tsc` clean, web bundle clean, no
console errors.

---

## Risks / notes

- **DST edge (step 1).** The two-pass offset is off by the DST hour only
  for a wall-clock time inside the ~1h spring-forward / fall-back window.
  Sunrise and hourly slots almost never land there; accepted, not guarded.
- **Pass-through strings (step 1).** The offset/`Z` regex guard keeps the
  helper safe if Open-Meteo ever returns offset-bearing timestamps.
- **`daily.time` is date-only** — never fed to `parseLondonWallTime`; used
  verbatim as the map key (step 4).
- **Memo churn (step 9).** Minute-bucketing `referenceDate` is a
  deliberate refinement of spec N2; noted here per the update-in-same-commit
  rule.
- **`combine` identity.** `combineForecastData` returns a fresh object each
  call already; adding one field doesn't change its render behaviour.

## Commit / PR

Branch `claude/intent-md-documentation-f02d9f` (as-is; rename to
`claude/webapp-day-insights` is optional — decide at PR time). Two commits,
one PR, opened ready for review (not draft), per `AGENTS.md`:

1. **`Parse Open-Meteo times as Europe/London wall-clock`** — steps 1–2.
   Self-contained bugfix; no-op for UK viewers.
2. **`Add a day-insights block to the webapp`** — steps 3–9 plus the
   `intent/` docs (intent, spec, plan).

Before pushing, check the PR hasn't already merged (`AGENTS.md`).
