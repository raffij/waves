# Waves

Tide, wave, wind and rain conditions for **Hastings Pier** (East Sussex, UK),
with a 5-day forecast. One data shape — current level + trend, an hourly
chart, tidal highs/lows per day — delivered by **four independent clients**
that share no fetch or parsing code with each other.

| Client | Platform | Path | Docs |
| --- | --- | --- | --- |
| **App** | iOS · Android · Web (React Native / Expo) | [`expo/`](expo/) | [`expo/README.md`](expo/README.md) |
| **iOS home-screen widget** | iOS 16+ (WidgetKit) | [`expo/targets/widget/`](expo/targets/widget/) | [`expo/targets/widget/README.md`](expo/targets/widget/README.md) |
| **macOS menu-bar script** | macOS (xbar / SwiftBar) | [`mac-widget/wave-hastings.15m.swift`](mac-widget/wave-hastings.15m.swift) | [`mac-widget/README.md`](mac-widget/README.md) |
| **macOS desktop widget** | macOS 14+ (WidgetKit) | [`mac-widget/DesktopWidget/`](mac-widget/DesktopWidget/) | [`mac-widget/DesktopWidget/README.md`](mac-widget/DesktopWidget/README.md) |

The web build is deployed to GitHub Pages: **<https://raffij.github.io/waves/>**

## Data sources

Every client reads from the same two upstreams:

- **[TideCheck](https://tidecheck.com)** — tidal extremes and the tide-height
  time series. Needs a free API key (50 requests/day on the free tier), sent
  as an `X-API-Key` header. Each client stores the key in its own
  platform-appropriate place (see per-client docs).
- **[Open-Meteo](https://open-meteo.com)** — wave height (Marine API), wind
  speed, precipitation and sunrise/sunset (Forecast API). No key required.

All times are handled in **Europe/London** throughout.

## Repository layout

```
expo/                         React Native / Expo app (iOS, Android, web)
  App.tsx                      single screen
  src/components/              CurrentLevelCard, TideChart, PrecipitationChart,
                               ForecastList, DayInsights, ApiKeyPrompt
  src/hooks/                   useForecastData, useApiKey, useLocation,
                               useWidgetSync, useTheme
  src/services/               API clients, interpolating series, TideClock,
                               DayInsights, DaylightSeries, DayWindow
  modules/widget-bridge/       local Expo Module: pushes config to the iOS widget
  targets/widget/              iOS home-screen widget (Swift/SwiftUI, WidgetKit)
mac-widget/
  wave-hastings.15m.swift      xbar / SwiftBar menu-bar plugin (standalone script)
  DesktopWidget/               macOS desktop widget (SwiftUI app + widget extension)
docs/
  architecture.md              how the four clients fit together, what's duplicated
  architecture/                typed Archify source + interactive HTML diagrams
  decisions/                   architecture decision log (one file per decision)
intent/                        AI-native SDLC artifacts (intent → spec → plan)
```

## Getting started

Pick the client you want — each is self-contained:

- **App** (fastest to try): `cd expo && npm install && npm run web`, then paste
  a TideCheck API key when prompted. See [`expo/README.md`](expo/README.md)
  for iOS/Android and the native build.
- **iOS widget**: built into the app via `expo prebuild`; it borrows the
  app's key over a shared App Group. See
  [`expo/targets/widget/README.md`](expo/targets/widget/README.md).
- **macOS menu-bar script**: drop the `.swift` file into your xbar/SwiftBar
  plugins folder and add the key to the login Keychain. See
  [`mac-widget/README.md`](mac-widget/README.md).
- **macOS desktop widget**: generate the Xcode project with XcodeGen, build
  the settings app once, drag the widget onto the desktop. See
  [`mac-widget/DesktopWidget/README.md`](mac-widget/DesktopWidget/README.md).

## Design

The four clients are **deliberately independent** — no shared package, no
shared network layer, cache or in-flight lock. Each is a separate,
hand-written implementation of the same shape, so a change to one never
silently changes another. [`docs/architecture.md`](docs/architecture.md)
lays out what's identical, what's duplicated, and why, with an interactive
diagram in [`docs/architecture/`](docs/architecture/).

## Development

- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs
  Oxlint, Oxfmt and `npx tsc --noEmit` against `expo/` on every PR, and
  squash-merges automatically once checks pass on a non-draft PR.
- **Deploy** ([`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml))
  exports the static web build (`npx expo export --platform web`) and
  publishes `expo/dist` to GitHub Pages whenever `expo/**` changes on `main`.
- The Swift clients have no CI — build them locally per their READMEs.
