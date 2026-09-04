# 2026-09-04. Day-insights logic splits into one module per weather domain

- **Date:** 2026-09-04
- **Status:** Accepted

Written together with
[2026-09-04](2026-09-04-adopt-vitest-for-the-service-layer.md), which comes
first — the characterisation suite it adds is what holds this split in
place.

## Context

`expo/src/services/DayInsights.ts` had grown past 1,000 lines. It opened
with a ~60-line block of tuning constants, then ran wind → rain → sun →
feels-like → light → clothing → assembly, each section marked only by a
`// --- section ---` comment. Nothing was tangled — it's a pure pipeline
from `DayInsightsInput` to one sentence — but a reviewer had to hold the
whole file to follow any one thread, and each tuning knob sat hundreds of
lines from the code that reads it.

## Decision

Move the file to a `dayInsights/` directory, one module per weather domain,
each pairing its analyser with its phrase builder and holding its own
tuning constants:

    format.ts    hhmm / capitalize / average / hourLabel, HOUR_MS
    window.ts    Slot, LightBounds, the 06:00–20:00 slots, the
                 morning/afternoon split, past/today/future tense,
                 remaining-hours logic
    wind.ts / rain.ts / sun.ts / feels.ts / light.ts   one domain each
    clothing.ts  the wardrobe call — downstream of feels/wind/rain
    readout.ts   buildReadout, assembles the clause fragments
    types.ts     DayInsightsInput / DayInsightsReadout
    index.ts     buildDayInsights entry point; re-exports sunBandFor /
                 SunBand / WET_HOUR_MM / HEAVY_PEAK_MM for DayCondition.ts

Dependencies run one way: `format` and `window` are leaves; the domain
modules depend only on those; `clothing` then depends on `feels`/`wind`/
`rain`; `readout` and `index` sit at the bottom. Import sites resolve the
directory through `index.ts`, so `App.tsx`, `App.preview.tsx`,
`ForecastList.tsx`, `DayInsights.tsx` and `DayCondition.ts` change only in
the path string.

It is a pure move — no banding threshold, phrase, or branch changed. The
evidence is the characterisation suite: every inline snapshot is byte-for-
byte identical before and after.

**Alternatives considered.**

- *Leave it as one file.* It works and it's well-sectioned. Rejected: at
  1,000+ lines the section comments were doing a file boundary's job
  badly, and "open the whole thing to read one clause" is exactly the
  review friction this repo's small-module norm avoids elsewhere.
- *Split, and also thread a computed `DayContext` and fold the repeated
  past/today/future verb ternaries into a `conjugate` helper in the same
  change.* Rejected for this record: those touch logic and would blur the
  "pure move, snapshots unchanged" guarantee. Left as a follow-up now that
  the suite exists to catch a regression.
- *Keep a barrel `DayInsights.ts` re-exporting the new modules.* Rejected
  — a case-only `DayInsights.ts` vs `dayInsights/` pair is a hazard on a
  case-insensitive filesystem, and the barrel earns nothing once the five
  import sites are updated.

## Consequences

Each domain is a ~60–180-line file a reviewer can read alone, with its
knobs at the top. `git blame` on the logic now points at the new files
from this commit — `git log --follow` still reaches the history.
`DayCondition.ts`'s shared symbols come from `dayInsights/index.ts`'s
explicit re-export list, so what's genuinely shared across the two is
visible in one place. The `DayContext` / `conjugate` cleanup is still
outstanding.

## Diagram

No system-map impact. This is an internal reorganisation of one service
module — no component, data source, boundary, or connection changes. The
architecture diagrams in `docs/architecture/` show the four clients and
their shared shape, not the internals of a single module.
