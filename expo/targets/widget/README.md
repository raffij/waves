# Wave Hastings — iOS home-screen widget

Built with [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets),
which adds this as a widget extension target during `expo prebuild` — there's
no `ios/` project checked in, so nothing here needs hand-editing an Xcode
project.

## Setup

1. Set your real Apple Developer Team ID in `app.json` (`expo.ios.appleTeamId`,
   currently `"YOUR_APPLE_TEAM_ID"`).
2. Install dependencies: `npm install` (pulls in `@bacons/apple-targets`).
3. Generate the native project:
   ```sh
   npx expo prebuild -p ios --clean
   ```
4. Open in Xcode to build and run: `xed ios`. Both the app and the
   `wave_hastings_widget` extension targets should already have the
   `group.com.anonymous.hastings-tide` App Group entitlement — Xcode may ask
   to register it with your team the first time you build.
5. Run the app once and add your TideCheck API key as usual — that's what
   pushes config to the widget (see below). Then long-press the home screen
   → **+** → **Wave Hastings** to add it, in small, medium or large size.
6. For a real device/TestFlight build: `eas build -p ios`.

## How the widget gets its data

Unlike the app, the widget can't show a text field to ask for an API key, so
it borrows the app's:

- `expo/modules/widget-bridge/` is a local Expo Module (Swift) exposing
  `syncConfig(json)` and `reloadWidgets()` to JS.
- `expo/src/hooks/useWidgetSync.ts` calls it whenever the app's API key or
  selected location changes, writing `{apiKey, stationId, latitude,
longitude, locationName}` into the shared App Group's `UserDefaults`.
- `Widget.swift`'s `TimelineProvider` reads that config on every timeline
  reload (roughly hourly) and fetches TideCheck + Open-Meteo itself — it does
  **not** reuse the app's already-fetched data or its AsyncStorage cache,
  mirroring how the macOS menu-bar script and the new
  [macOS desktop widget](../../mac-widget/DesktopWidget) each do their own
  independent fetch too (see `docs/architecture.md`).

If the widget hasn't received a config yet (fresh install, no API key saved),
it shows a "open the app" placeholder instead of failing silently.
