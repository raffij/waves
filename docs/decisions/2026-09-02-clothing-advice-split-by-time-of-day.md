# 2026-09-02. Clothing advice splits into a core-hours pick and a rest-of-day pick

- **Date:** 2026-09-02
- **Status:** Accepted

## Context

The clothing call (decisions [2026-09-01](2026-09-01-clothing-advice-matches-actual-wardrobe.md),
[2026-09-01](2026-09-01-mild-band-treated-as-shorts-weather.md),
[2026-09-02](2026-09-02-sandals-win-over-boots-when-mild-and-wet.md)) picked one outfit
for the whole remaining day window (06:00–20:00), keyed off the mean
feels-like temperature across it. On a day with a big morning/evening-to-
midday swing — cool at the edges, warm through the middle — that single mean
can land in a temp band that fits neither end well: a shorts-and-sandals
pick for a morning that's actually still jumper-and-trousers weather, or
vice versa. The user asked for clothing to be recommended for two ranges
instead: the hours between 8 and 4 (08:00–16:00), and the hours beyond that
(the rest of the 06:00–20:00 window: early morning and evening).

## Decision

Split the clothing call into two time-of-day segments — `CLOTHING_CORE_START_HOUR`
(8) to `CLOTHING_CORE_END_HOUR` (16), and everything else inside the shared
day window — each read off its own mean feels-like temperature and its own
share of dark hours, so a segment near sunrise/sunset can independently earn
an "after dark" note the midday segment wouldn't. Rain (`wet`/`groundWet`)
stays a single flag for the whole remaining day rather than being read per
segment: decision [2026-09-01](2026-09-01-clothing-advice-matches-actual-wardrobe.md) already treats any rain still ahead in the window as
reason to dress for rain regardless of exactly which hour it falls in, and
extending that same "better dressed for it than not" reasoning to segments
avoids tracking which segment a rain spell actually overlaps.

When the two segments' picks come out identical (same top, bottom, footwear,
and extra note — the common case on a day whose temperature doesn't cross a
band boundary), the readout collapses back to one "Wear ..." sentence,
matching the existing "each signal is mentioned once" rule the rest of the
readout follows. Only when they differ does the sentence split into "Between
08:00 and 16:00, wear ... . Outside those hours, wear ...". On `today`, a
segment with no hours left ahead (e.g. it's already past 16:00) is dropped
entirely rather than shown empty, so the single remaining segment's pick is
used unqualified, same as before this change.

An alternative — keeping rain/ground-wet as a per-segment read too, using
each segment's own precipitation peak — was rejected as unnecessary
complexity: the wardrobe's rain override is already a whole-day, cautious
call by design ([2026-09-01](2026-09-01-clothing-advice-matches-actual-wardrobe.md)), and splitting it further would mean re-deriving
which segment a spell overlaps without changing the actual advice in the
common case (rain in the morning still means boots are better than camper
shoes come afternoon, since ground stays wet).

## Consequences

A day reading "it should feel mild, around 8–21°C" during a hot midday and
cool morning/evening now advises "Between 08:00 and 16:00, wear a t-shirt
and shorts, with sandals. Outside those hours, wear a jumper and trousers,
with camper shoes." instead of a single mild-band pick smoothing over both.
A day with a flat temperature curve is unaffected — same single "Wear ..."
sentence as before. Adding a third time segment later, if ever needed, means
generalizing `pickForSegment`'s two call sites into a loop rather than a
rewrite.

## Diagram

No diagram update is needed: this changes clothing-advice logic and the
wording of a presentational model inside `DayInsights.ts`, not any system
component, connection, or boundary shown in `docs/architecture/`.
