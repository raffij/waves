# 2026-09-05. Add a standalone CLI generator for a shareable swim-report card

- **Date:** 2026-09-05
- **Status:** Accepted

## Context

A user wanted a generator that produces a poster-style "Swim Hastings"
image — tide state, sea temperature, wave/wind, sunset, an illustrated
coastline with named beaches — as a PNG saved wherever they choose, based
on a mockup screenshot they supplied. That mockup also showed a "2 beaches
flagged" badge and color-coded per-beach flag markers, implying real-time
per-beach water-quality/safety monitoring the app has no data source for
anywhere today.

Two decisions needed making before writing code, so the user was asked:

1. **Where does this run?** A standalone local CLI, or a new in-app
   export/share feature (which would mean a native folder-picker per
   platform: iOS/Android/web). Chosen: **standalone CLI**
   (`tools/swim-card/`) — simplest to build/test, and it doesn't touch
   app navigation or add a new native permission.
2. **Live data, or a static reproduction of the mockup?** Chosen: **live
   data**, for a single location (Hastings Pier, matching
   `DEFAULT_LOCATION`), fetched directly from TideCheck + Open-Meteo.

## Decision

Add `tools/swim-card/`, a Node.js CLI (`npm run generate -- --out
<folder>`) that fetches tide/wave/wind/sea-temperature/sun data and
renders a PNG card:

- **A new, independent client**, fetching TideCheck and Open-Meteo exactly
  like the app/xbar-script/widgets do, with its own standalone fetch/parse
  code (`tideClient.mjs`, `weatherClient.mjs`, `series.mjs`,
  `tideClock.mjs`) rather than importing from `expo/src/services/` —
  consistent with this repo's rule that no client shares fetch/parse code
  with any other. Unlike the four existing clients it has no cache and no
  persisted key store: it's a one-shot script that fetches once and exits,
  so there's nothing worth caching.
- ~~**Per-beach flag data is dropped, not fabricated.** The mockup's "2
  beaches flagged" badge and color-coded pins imply real water-quality
  monitoring per beach; nothing in this app (or its two upstreams) reports
  that. Rather than inventing plausible-looking but fake safety statuses,
  the coastline illustration keeps the real place names (Bexhill, Glyne
  Gap, Bulverhythe, St Leonards, Pelham, Rock-a-Nore, Fairlight) as plain
  decorative markers with no flag/color meaning, and the top-right badge
  shows a real reading instead.~~ **Superseded same-day** by
  [2026-09-05](2026-09-05-beach-water-quality-flags.md): the user clarified
  the flags are meant to reflect real per-beach water-quality status,
  computed from water companies' storm-outflow data — this was wrong to
  assume away. The sea-state badge/pins this bullet describes were replaced
  by a real (best-effort, unverified) per-beach flag integration; the
  sea-state reading it introduced stayed, moved onto the "SEA" stat box.
- **`@napi-rs/canvas` over a headless-browser render.** Considered
  Playwright/Puppeteer + an HTML/CSS template (screenshot it), which would
  let the design be written in familiar CSS. Rejected: it means a Chromium
  download as part of `npm install` for every user of this script, just to
  rasterize one image. `@napi-rs/canvas` ships prebuilt native bindings
  for the common platforms via npm (no browser, no native toolchain to
  compile against, unlike `node-canvas`/`cairo`) and the 2D canvas API is
  more than enough for this layout.
- **`@fontsource/baloo-2` and `@fontsource/nunito`** (npm packages that
  ship the actual font files) are registered at runtime via
  `GlobalFonts.registerFromPath`, rather than depending on whatever fonts
  happen to be installed on the machine running the script — keeps the
  card's look identical everywhere.
- **New sea-state bands (flat/gentle/bouncy/rough)** are this tool's own
  convention, tuned by eye against typical UK nearshore wave heights
  (0.1–1.5m). Nothing elsewhere in the app labels "how bouncy is the sea"
  today — `WaveSeries.ts` only exposes height and trend.
- **A `--sample` flag** renders from synthetic-but-realistic fixture data
  (`sampleData.mjs`) built in the exact same raw-API shape TideCheck/
  Open-Meteo return, run through the same `compute.mjs` path real data
  takes. Added so the card can be previewed/tested with no API key and no
  network access, not just as a demo convenience.

## Consequences

Anyone with a TideCheck key can generate a current, shareable swim-report
image in one command, saved to any folder they pick (prompted for
interactively, or via `--out`). `--sample` also means this tool's own
layout can be tested and iterated on without live network calls or a key —
useful in this repo's own CI/sandboxed environments too.

This is a fifth thing that independently calls TideCheck/Open-Meteo,
widening the "no shared code between clients" duplication the existing
four clients already carry — accepted as the same deliberate tradeoff
`docs/architecture.md` already documents, not a new one.

Follow-up, not done here: no cache/rate-limit handling beyond TideCheck's
free-tier limit (a user generating cards very frequently could exhaust
their 50 requests/day, same constraint the app already documents); wiring
this into CI to catch rendering regressions, if the card's design turns
out to need to stay stable over time.

## Diagram

No diagram change. `docs/architecture/waves.architecture.json`'s system
map depicts the four **continuously-running** clients (an app process, two
WidgetKit extensions, a script re-invoked every 15 min) that each keep
their own key store and cache. This CLI is architecturally different in
kind, not just a fifth instance of the same shape: it holds no key store,
keeps no cache, and only ever runs one-shot, invoked by hand for one output
file — it doesn't extend that map's "four independent clients, each with
a key store and a cache" shape, so adding it there would misrepresent both
diagrams rather than clarify either.
