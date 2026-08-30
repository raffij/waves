# Wave Hastings — macOS desktop widget

A real WidgetKit widget you drag onto the desktop (macOS 14 Sonoma+), distinct
from the [xbar/SwiftBar menu-bar script](../wave-hastings.15m.swift) one
level up — that one re-runs a standalone script every 15 minutes; this one is
a proper app + widget extension pair that fetches on WidgetKit's own timeline
schedule (roughly hourly).

It has no project file checked in — [XcodeGen](https://github.com/yonaskolb/XcodeGen)
generates `WaveHastingsDesktop.xcodeproj` from `project.yml` on demand, so
there's a plain-text spec to diff instead of an opaque `.pbxproj`.

## Setup

1. Install XcodeGen: `brew install xcodegen`
2. Generate the Xcode project:
   ```sh
   cd mac-widget/DesktopWidget
   xcodegen generate
   open WaveHastingsDesktop.xcodeproj
   ```
3. In Xcode, select both the `WaveHastingsDesktop` and
   `WaveHastingsWidgetExtension` targets → Signing & Capabilities → set your
   own Team. Xcode will offer to register the `group.com.anonymous.hastings-tide`
   App Group and the two bundle IDs automatically; accept it, or change the
   identifiers in `project.yml` first if you want your own.
4. Build and run `WaveHastingsDesktop` once — this registers the widget with
   the system. A small window opens; paste your
   [TideCheck](https://tidecheck.com) API key, pick a location, and hit Save.
5. Right-click the desktop → **Edit Widgets** → find **Wave Hastings** → drag
   it onto the desktop. Small, medium and large sizes are supported.

## Where things live

- `App/` — the settings window (SwiftUI). Its only job is writing the API
  key and location to the shared App Group so the widget extension can read
  them (`Shared/SharedConfigStore.swift`) — see that file's comment for why
  this uses `UserDefaults(suiteName:)` rather than a shared Keychain group.
- `Widget/` — the widget extension: `Provider.swift` (timeline) and
  `WaveWidgetView.swift` (small/medium/large SwiftUI layouts).
- `Shared/` — fetch/parsing logic, deliberately a near-duplicate of
  `mac-widget/wave-hastings.15m.swift` rather than a shared package, per this
  repo's existing convention (see `docs/architecture.md`). It's shared only
  *within* this Xcode project, between the app and its own widget extension.

## Notes

- No disk cache: WidgetKit already throttles reloads to roughly hourly, so
  the extension just fetches fresh each time rather than duplicating the
  xbar script's 6h cache.
- `com.apple.security.application-groups` needs a paid Apple Developer
  account to register for real; a personal free-tier Team ID can still build
  and run this locally.
