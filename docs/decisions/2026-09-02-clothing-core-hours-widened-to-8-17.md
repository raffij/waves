# 2026-09-02. Clothing core hours widen from 08:00–16:00 to 08:00–17:00

- **Date:** 2026-09-02
- **Status:** Accepted

## Context

Decision [2026-09-02](2026-09-02-clothing-advice-split-by-time-of-day.md) split the
clothing call into a core segment and the rest of the day, picking
08:00–16:00 for the core on the reading of "8 and 4" as an 8-to-4 workday.
Seeing it against a real forecast, the user asked to "condense the main
times to 8-5" — an 8-to-5 day instead, which changes where the core/rest
boundary falls in the evening.

## Decision

`CLOTHING_CORE_END_HOUR` moves from 16 to 17; `CLOTHING_CORE_START_HOUR`
(8) is unchanged. This only shifts the segment boundary — the split/collapse
logic, dark-share and wind reads, and everything else in decision [2026-09-02](2026-09-02-clothing-advice-split-by-time-of-day.md)
carries over unchanged.

## Consequences

An hour that previously fell in the "rest of day" segment (17:00) now reads
as part of the core segment instead — e.g. a forecast with rain starting at
17:00 now has that hour's conditions counted toward the 08:00–17:00 pick
rather than the evening one. No other behavior changes.

## Diagram

No diagram update is needed: this changes a tuning constant inside
`DayInsights.ts`, not any system component, connection, or boundary shown in
`docs/architecture/`.
