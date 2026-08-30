# Waves — macOS menu-bar script

[`wave-hastings.15m.swift`](wave-hastings.15m.swift) is a standalone
[xbar](https://xbarapp.com) / [SwiftBar](https://github.com/swiftbar/SwiftBar)
plugin: a single Swift script the bar app re-runs **every 15 minutes** (the
`.15m.` in the filename) and renders as a menu-bar item with a dropdown.

For the drag-onto-the-desktop WidgetKit version, see
[`DesktopWidget/`](DesktopWidget/) — that one is a proper app + widget
extension, not a script.

## What it shows

- **Menu bar:** current tide height and trend arrow, e.g. `2.1m ↑`.
- **Dropdown:** tide / wave / wind right now; an ASCII hourly chart for
  today, 6am–10pm; a 5-day forecast (plus yesterday) of tidal highs and
  lows; and a footer with the fetch time, a **Force refresh** item (clears
  the cache and refetches — uses API calls) and **Refresh display**.

The station is hardcoded to Hastings Pier (`hastings_pier-hgp-gbr-cco`).

## Requirements

- macOS with **xbar** or **SwiftBar** installed.
- A **Swift toolchain** — the script starts with `#!/usr/bin/swift`, so you
  need Xcode or the Command Line Tools (`xcode-select --install`).
- A **[TideCheck](https://tidecheck.com) API key** (free tier: 50
  requests/day).

## Install

1. **Add the API key to your login Keychain** (service name matters — the
   script looks it up by exactly this):

   ```bash
   security add-generic-password -a "$USER" -s wave-hastings-tidecheck-api-key -w 'YOUR_TIDECHECK_KEY'
   ```

2. **Drop the script into your plugins folder** (xbar: *xbar → Open plugin
   folder…*; SwiftBar: its configured folder). A symlink keeps it in sync
   with the repo:

   ```bash
   ln -s "$(pwd)/wave-hastings.15m.swift" ~/Library/Application\ Support/xbar/plugins/
   chmod +x wave-hastings.15m.swift
   ```

3. **Refresh** xbar/SwiftBar (or just wait up to 15 minutes). The item
   appears once the first fetch lands.

If no key is found it shows a red *"No TideCheck API key found in Keychain"*
line instead of failing silently.

## Behaviour

- **Refresh:** the bar app re-runs the script every 15 minutes; menu items
  also re-run it on demand.
- **Cache:** tide and wave/wind responses are cached under
  `~/Library/Caches/` for **6 hours**. On a network error the script serves
  the last cache; **Force refresh** deletes the cache files and forces a
  fresh fetch.
- **Timezone:** Europe/London throughout, matching the other clients.
- The fetch/parse logic here (`TideClock`, `ValueSeries`, `TideForecast`,
  the TideCheck + Open-Meteo calls) is a deliberate near-duplicate of the
  other clients' — no shared package. See
  [`../docs/architecture.md`](../docs/architecture.md).
