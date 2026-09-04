# Waves — app

The React Native / Expo client. One scrolling screen showing conditions for
**Hastings Pier** (or Morecambe), runnable on iOS, Android and the web. The
web build is live at **<https://raffij.github.io/waves/>**.

## What it shows

- **Current conditions** — tide height, wave height and wind speed/direction
  right now, each with a rising / falling / steady arrow.
- **Tide chart** — the tide curve from 06:00–20:00 with wave and wind drawn
  over it; drag to scrub a reading at any time.
- **Precipitation chart** — hourly rain bars with the next rain time.
- **Daylight on both charts** — the hours before sunrise and after sunset are
  shaded, with a dashed mark at each and the times in the legend
  (e.g. "Light 07:52–16:05"), so you can see at a glance which part of the
  window is actually light.
- **Day insights** — a plain-language read of the selected day: a one-line
  summary (wind shape and direction — "Breezy all day, backing from
  southwest to south" — plus rain spell, named by how hard it falls, plus
  "dark by …" when the light goes before the window ends), and a call on
  **what to wear** with the reading behind it — e.g. "Dry robe · heavy rain, 26mph
  wind", "Umbrella · light drizzle, light wind", "Warm layer · dry, light
  wind, after dark". The garment comes from how hard the rain still to come
  is falling, the wind it arrives on, and whether the hours you'd be out in
  are dark.
- **Forecast scroller** — yesterday through +5 days, each tile showing that
  day's tidal high/low. Selecting a day re-points the card, both charts and
  the insights at it.
- **Location toggle**, pull-to-refresh, light/dark theme, and a key reset,
  along the bottom.

## Prerequisites

- **Node 20** and npm.
- A **[TideCheck](https://tidecheck.com) API key** (free tier: 50 requests/day).
  You paste it into the app on first launch; it's kept in
  `expo-secure-store` (Keychain / Keystore), falling back to `AsyncStorage`
  on web.
- For native builds: Xcode (iOS) or Android Studio (Android). The web build
  needs neither.

## Run it

```bash
cd expo
npm install
npm run web       # http://localhost:8081 in a browser
# or
npm run ios       # expo run:ios  — builds and boots the iOS app
npm run android   # expo run:android
```

On first launch, paste your TideCheck API key. Wave/wind/rain need no key.

### Preview harness

```bash
npm run preview   # http://localhost:8081, no key or network needed
```

Boots `App.preview.tsx` instead of the real app: every component (current
conditions, day insights, all three charts) rendered against synthetic
data built from simple formulas rather than a live fetch. Useful for
eyeballing a UI change across all three themes without a TideCheck key or
network access to TideCheck/Open-Meteo.

### Lint, typecheck & test

```bash
npm run lint       # oxlint + oxfmt --check
npm run lint:fix   # oxlint --fix + oxfmt, with fixes
npx tsc --noEmit   # types
npm test           # vitest run (service-layer unit tests)
npm run test:watch # vitest, watch mode
```

CI runs all of these on every PR. Vitest only covers the plain-TypeScript
service layer (`src/services/`, `src/models/`) — no React Native runtime,
so no jest-expo preset. `src/services/dayInsights/dayInsights.test.ts` is
a characterisation suite: fixed inputs pinned to their exact readout
sentence via inline snapshots, regenerated with `npx vitest run -u`.

## Project layout

```
App.tsx                    the single screen; wires hooks to components
src/
  components/
    CurrentLevelCard.tsx    the three current readings + trend arrows
    TideChart.tsx           SVG tide/wave/wind chart with drag-to-scrub
    PrecipitationChart.tsx  hourly rain bars
    TemperatureChart.tsx    feels-like/temperature line with sun + cloud overlay
    daylight.ts             night-band geometry shared by all three charts
    DayInsights.tsx         renders the plain-language day summary
    ForecastList.tsx        the horizontal day scroller
    ApiKeyPrompt.tsx        first-launch key entry
  hooks/
    useForecastData.ts      TanStack Query: coordinates the tide + wave fetches
    useApiKey.ts            reads/writes the key via SecureKeyStore
    useLocation.ts          Hastings ⇄ Morecambe, persisted
    useWidgetSync.ts        pushes {key, location} to the iOS widget
    useTheme.tsx            dark/poster/glass themes, persisted; syncs the
                            web <meta name="theme-color"> tag on change
    useClockTick.ts         re-renders "now" on an interval, foreground-only
    useAppStateFocusManager.ts
                            wires TanStack Query's refetch-on-focus to
                            AppState on native (web gets it for free)
  services/
    TideAPIClient.ts        TideCheck fetch + 6h AsyncStorage cache
    WaveAPIClient.ts        Open-Meteo Marine + Forecast fetch + cache
    SecureKeyStore.ts       Keychain-backed key storage, localStorage on web
    WidgetSync.ts           pushes {key, location} to the iOS widget over
                            the shared App Group
    TideSeries / WaveSeries / WindSeries / PrecipitationSeries /
    TemperatureSeries / SunBrightnessSeries / CloudCoverSeries
                            raw points → "value now" + "trend" by interpolation
    TideForecast.ts         groups tidal extremes into labelled days
    DaylightSeries.ts       per-day sunrise/sunset
    DayWindow.ts            the 06:00–20:00 window both charts and the
                            insights judge the day over
    DayCondition.ts         one glyph-worthy condition (rain/sunny/hazy/
                            overcast) per day, for the forecast list's tiles
    dayInsights/            pure buildDayInsights(); one module per weather
                            domain (wind/rain/sun/feels/light/clothing),
                            each with its own tuning constants, assembled
                            by readout.ts — see index.ts
    TideClock.ts            all Europe/London date parsing / formatting
  models/                   plain data shapes, no behaviour
    Location.ts             the location list + selected-location type
    TideModels.ts           TideCheck response shapes
    WeatherModels.ts        Open-Meteo response shapes (wave/wind/rain/
                            temperature/sun/cloud/daylight)
  theme.ts                  the dark/poster/glass colour tokens
modules/widget-bridge/      local Expo Module (Swift) that the iOS widget uses
targets/widget/             the iOS home-screen widget itself
```

Within `services/`, a `*Series` class wraps one model's raw time-stamped
points and answers "value now" / "trend" by interpolation; a plain function
(`buildDayInsights`, `dayCondition`, `hoursFor`) derives something from one or
more of those series instead. Both API clients keep the same split: the
request/cache/response-shaped types they hand back live in `models/`, and
only their own cache-wrapper type (`TideDataResult`, `WaveDataResult` — the
data plus a `fetchedAt`) stays in the client file itself, since that shape is
an artifact of the client's own caching, not something the API returned.

## How it fetches

- `useForecastData` runs two queries in parallel via TanStack Query — a tide
  query keyed on `(stationId, apiKey)` and a wave query keyed on
  `(locationId)` — and only enables them once both the key and location have
  hydrated from storage.
- Each API client checks its own **6-hour `AsyncStorage` cache** first. On a
  network error it serves the last cache rather than showing nothing.
- **Query retries are disabled** — TideCheck's 50/day budget is small and the
  stale-cache fallback already covers transient failures.
- If a landed cache entry is over an hour old, a silent background refresh
  tops it up without blocking the rendered screen.
- Wave / wind / precipitation / daylight is a **non-essential overlay**: a
  failure there is swallowed so it can never block the tide UI.

`TideClock.parseLondonWallTime` resolves Open-Meteo's offset-less timestamps
against Europe/London, so the charts read correctly regardless of the
viewer's own timezone.

## The iOS widget

The widget can't show a text field for the API key, so the app hands it one:
`useWidgetSync` writes `{apiKey, stationId, latitude, longitude,
locationName}` into a shared App Group whenever the key or location changes,
via the local `modules/widget-bridge/` Expo Module, then asks WidgetKit to
reload. Setup and build steps are in
[`targets/widget/README.md`](targets/widget/README.md).

## See also

- [`../docs/architecture.md`](../docs/architecture.md) — how this app relates
  to the three other clients (and what's duplicated between them).
- [`AGENTS.md`](AGENTS.md) — note: Expo SDK 57; check the versioned docs at
  <https://docs.expo.dev/versions/v57.0.0/> before changing native config.
