# Architecture

Tide, wave and wind conditions for Hastings Pier, shipped as **four independent
clients** — a React Native app (`expo/`), an iOS home-screen widget
(`expo/targets/widget/`), a macOS menu-bar script (`mac-widget/`), and a macOS
desktop widget (`mac-widget/DesktopWidget/`) — that read from the same two
external APIs but share no fetch/parse code between them. There's no shared
package: every difference below is a separate, hand-written implementation of
the same shape.

**Contents**

- [System map](#system-map)
- [What's identical, what's duplicated](#whats-identical-whats-duplicated)
- [Cold-start request lifecycle](#cold-start-request-lifecycle)
- [Inside the Expo app](#inside-the-expo-app)
- [How the day-insights readout is generated](#how-the-day-insights-readout-is-generated)
- [The two widgets](#the-two-widgets)
- [Notes](#notes)

## System map

All four clients run roughly the same shape — read a key, fetch tide extremes
plus wave/wind, then either cache for six hours (the app and the xbar script)
or just fetch fresh each time (the two widgets, since WidgetKit already
throttles reloads) — against the same TideCheck and Open-Meteo endpoints.
Nothing below that shape is shared: each client has its own key store and its
own fetch client. The Expo app additionally checks the Environment Agency's
bathing-water classification for the selected location — an overlay only it
fetches; the other three clients don't.

<img src="architecture.png" width="900" alt="How Waves works: the Expo app, the iOS widget, the macOS menu-bar script and the macOS desktop widget each read an API key from their own platform key store, then independently call TideCheck's tides API, Open-Meteo's Marine API, and Open-Meteo's Forecast API — no fetch/parse code is shared between any of them. The Expo app alone also checks the Environment Agency's bathing-water classification for the selected location." />

An interactive version — pan/zoom, theme toggle, guided views for the tide
path, the wave/wind calls, where each key lives, and how the app hands
config to its widget — is in
[`docs/architecture/waves.architecture.html`](architecture/waves.architecture.html)
(open it locally; the typed source is
[`waves.architecture.json`](architecture/waves.architecture.json)).

All four clients issue their requests independently — none shares a network
layer, a cache, or an in-flight-request lock with any other.

## What's identical, what's duplicated

| Aspect | Expo App | iOS Widget | macOS Menu Bar | macOS Desktop Widget |
| --- | --- | --- | --- | --- |
| **Runtime** | React Native (Hermes), one long-lived process | WidgetKit extension, reloaded roughly hourly | Swift script, re-invoked from scratch every 15 min | WidgetKit extension, reloaded roughly hourly |
| **Locations** | Multiple, user-togglable, persisted in AsyncStorage | One, whatever the app last synced | One, hardcoded (`hastings_pier-hgp-gbr-cco`) | One, set in its own settings app |
| **Charts** | Native SVG line/area charts (react-native-svg) | Native SwiftUI text/rows | ASCII bar rows in Menlo, 8 Unicode block levels | Native SwiftUI text/rows |
| **Cache** | AsyncStorage, 6h TTL, stale-on-failure | None — WidgetKit already throttles reloads | Disk JSON, 6h TTL, stale-on-failure | None — WidgetKit already throttles reloads |
| **Manual refresh** | Pull-to-refresh / footer button clears cache keys, refetches | N/A — reload on its own schedule, or when the app calls `reloadWidgets()` | xbar menu item `rm`'s the cache files, then `refresh=true` | N/A — reload on its own schedule, or when its settings app saves |
| **On fetch failure** | Serves the last cache, however stale | Shows a "couldn't load" placeholder | Serves the last cache, otherwise prints a red status line | Shows a "couldn't load" placeholder |
| **Water quality** | EA bathing-water check (unverified integration) | — | — | — |

## Cold-start request lifecycle

What happens between opening the Expo app and seeing numbers on screen:

1. **Key and location hydrate.** `useApiKey` and `useLocation` both start
   `undefined` rather than defaulting early, so nothing fires a request for
   the wrong key or location while the stores are still being read.
2. **Three queries enable at once.** Once both resolve, `useForecastData` turns
   on a tide query keyed on `(stationId, apiKey)`, a wave query keyed on
   `(location.id)`, and a water-quality query also keyed on `(location.id)` —
   run in parallel via `useQueries`.
3. **Tide client checks its cache.** `TideAPIClient` reads AsyncStorage; a hit
   under six hours old returns immediately, otherwise it calls TideCheck with
   an 8s timeout and an `X-API-Key` header, then writes the new cache.
4. **Wave client does the same, against two calls.** `WaveAPIClient` hits
   Open-Meteo's Marine API for wave height, then — independently, so one
   outage can't take down the other — the Forecast API for wind and
   precipitation together.
4a. **Water-quality client checks the EA's bathing-water classification.**
   `WaterQualityClient` converts the selected location's lat/long to an
   OSGB36 National Grid easting/northing (`OsGridRef.ts` — the coordinate
   system `environment.data.gov.uk` actually filters by, not lat/long/dist)
   and queries a ~2km bounding box around it; a request failure or
   unrecognised response degrades to `'unknown'` rather than ever guessing
   `'clear'` — same rule `tools/swim-card/src/beachQuality.mjs` uses for its
   per-beach flags. This is a partially-verified integration (see
   [`2026-09-05-beach-water-quality-flags.md`](decisions/2026-09-05-beach-water-quality-flags.md)
   and
   [`2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md`](decisions/2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md)):
   the response's exact field names still haven't been confirmed against
   the live API.
5. **Results become interpolating series.** Raw points turn into
   `TideSeries` / `WaveSeries` / `WindSeries` / `PrecipitationSeries`, which
   answer "value right now" and "trend" by linear interpolation between the
   nearest samples. The water-quality result is a single current reading, not
   a series — no interpolation applies.
6. **A silent background top-up.** If the cache hit that just landed was
   fetched over an hour ago, an effect quietly calls the cache-bypassing
   `refresh()` — the already-rendered screen never blocks on it.
7. **The widget gets synced.** `useWidgetSync` fires whenever the key or
   location changes, handing both to the iOS widget over a shared App Group
   (see below) and asking WidgetKit to reload.

## Inside the Expo app

The system map above treats each client as one "Tide/Wave Clients" box. Zooming
into just `expo/` — the webapp — shows the layers behind that box: `App.tsx`
wires a handful of hooks to seven presentational components; the hooks
(`useApiKey`, `useLocation`, `useTheme`, `useForecastData`, `useWidgetSync`)
own state and orchestrate fetching; and the services layer (the three API
clients, `SecureKeyStore`, `AsyncStorage`, and the interpolating Series +
`buildDayInsights()` view models) does the actual caching, fetching, and
computation, independent of any UI framework detail.

<img src="webapp-architecture.png" width="900" alt="Inside the Waves webapp: App.tsx wires state hooks and useForecastData to seven screen components; useForecastData coordinates a TideAPIClient, a WaveAPIClient and a WaterQualityClient that each keep their own AsyncStorage cache and call TideCheck, Open-Meteo or the Environment Agency's bathing-water API independently; useWidgetSync hands the API key and location to the iOS widget over a shared App Group via the local WidgetBridge Expo Module." />

An interactive version — guided views for boot/state hydration, the tide+wave
fetch, cache-first resilience, and the app→widget hand-off — is in
[`docs/architecture/webapp.architecture.html`](architecture/webapp.architecture.html)
(open it locally; the typed source is
[`webapp.architecture.json`](architecture/webapp.architecture.json)).

## How the day-insights readout is generated

The "so what" line above the charts — one deliberately wordy paragraph
covering the day's wind, rain, sun, feel, light and what to wear — is built
by `buildDayInsights()`, a pure pipeline from six nullable weather series to
one string. This zooms into that path: the Open-Meteo Forecast fetch and its
caches, the typed `Series` wrappers, the `DayInsightsInput` that `App.tsx`
and `ForecastList.tsx` assemble, and the `expo/src/services/dayInsights/`
modules themselves — the shared 06:00–20:00 window, the per-domain
analyser/phrase-builder pairs, the clothing call, and the `readout.ts`
assembler — plus the design decisions behind each.

<img src="insights.png" width="900" alt="How the Waves day-insights readout is generated: the Open-Meteo Forecast API (no key) is fetched by WaveAPIClient, cached in AsyncStorage for 6h and layered with a TanStack Query stale top-up in useForecastData, then wrapped in typed Series objects; App.tsx and ForecastList.tsx assemble a DayInsightsInput that index.ts/readout.ts turns into one summary paragraph by reading a shared 06:00-20:00 window and per-domain wind/rain/sun/feels/light analysers plus a clothing call; DayInsights.tsx renders the summary and DayCondition.ts reuses the same sun and rain thresholds for its per-day glyph." />

An interactive version — guided views for the fetch-to-Series path, building
the input, the one shared window, the domain analysers, and who consumes the
readout — is in
[`docs/architecture/insights.architecture.html`](architecture/insights.architecture.html)
(open it locally; the typed source is
[`insights.architecture.json`](architecture/insights.architecture.json)).

### The calculations, as IF → THEN rules

Zooming in once more: what each domain module actually does with its numbers.
Every one of `wind.ts` / `rain.ts` / `sun.ts` / `feels.ts` / `clothing.ts` runs
the same three-step recipe — IF the reading crosses a band, AND IF a
refinement applies, THEN emit a phrase — with the real threshold constants
from that module's own tuning knobs, not a paraphrase of them.

<img src="insights-calculations.png" width="900" alt="The day-insights calculations as IF/THEN rules, one lane per domain module. wind.ts: mean mph bands to calm/breezy/windy (under 12, 12-24, 24+), a 45-degree direction shift or a 10mph gust excess gets named, then windClause() emits speed and direction as one clause. rain.ts: peak mm per wet-hour spell bands to dry/drizzle/showery/heavy (up to 0.2, 0.5, 2, 2+), a spell of 4 hours or more compares its first and last third for a building/easing trend, then rainClause() emits timing, coverage and the trend. sun.ts: brightness in W/m2 bands to overcast/hazy/sunny/strong (under 120, 350, 450, 450+), cloud cover at 75%+ or under 25% can only push the band toward whichever reads cloudier, then sunTrendClause() emits morning vs afternoon in one line. feels.ts: mean feels-like Celsius bands to cold/cool/mild/warm/hot (under 10, 14, 19, 24), an AM-to-PM swing of 2 degrees or more gets named as warming or cooling, then feelsPhrase() emits the band, range and any trend. clothing.ts: triggered by feels' TempBand and rain's band, never wind, it picks top/bottom/footwear by temperature, overrides for rain still ahead, then clothingSentence() emits one line or two if the core-hours and rest-of-day segments differ." />

An interactive version — guided views for each domain's own recipe — is in
[`docs/architecture/insights-calculations.workflow.html`](architecture/insights-calculations.workflow.html)
(open it locally; the typed source is
[`insights-calculations.workflow.json`](architecture/insights-calculations.workflow.json)).

## The two widgets

Neither widget can show a text field to ask for an API key, so each borrows
one from a companion process, then fetches and renders entirely on its own —
mirroring the xbar script's fetch/parse logic (`TideClock`, `ValueSeries`,
the TideCheck + Open-Meteo calls) rather than reusing it or the app's
already-fetched data.

- **iOS home-screen widget** (`expo/targets/widget/`) — built into the Expo
  app via [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets),
  added as a widget extension target during `expo prebuild`. It gets its
  config from the app: `expo/modules/widget-bridge/` is a local Expo Module
  that writes `{apiKey, stationId, latitude, longitude, locationName}` into a
  shared App Group whenever `useWidgetSync` fires, and calls
  `WidgetCenter.reloadAllTimelines()`. The widget's own `TimelineProvider`
  reads that config and fetches TideCheck/Open-Meteo itself on every reload.
  See [`expo/targets/widget/README.md`](../expo/targets/widget/README.md) for
  setup.
- **macOS desktop widget** (`mac-widget/DesktopWidget/`) — a real WidgetKit
  widget draggable onto the desktop (macOS 14 Sonoma+), distinct from the
  xbar menu-bar script. It ships as its own small SwiftUI settings app plus a
  widget extension, generated via [XcodeGen](https://github.com/yonaskolb/XcodeGen)
  from a checked-in `project.yml` rather than a hand-edited `.xcodeproj`. The
  settings app writes the API key and location to a shared App Group; the
  widget extension reads it and fetches independently, same as the iOS
  widget. See [`mac-widget/DesktopWidget/README.md`](../mac-widget/DesktopWidget/README.md)
  for setup.

Both widgets deliberately skip the disk cache the app and xbar script keep —
WidgetKit already throttles reloads to roughly hourly, so there's little for
a cache to save.

## Notes

- `expo/` — React Native, TanStack Query, expo-secure-store
- `expo/targets/widget/` — Swift/SwiftUI, WidgetKit, `@bacons/apple-targets`
- `mac-widget/` — Swift, xbar/SwiftBar plugin protocol
- `mac-widget/DesktopWidget/` — Swift/SwiftUI, WidgetKit, XcodeGen
- Upstream: tidecheck.com, open-meteo.com
- Timezone: Europe/London throughout
