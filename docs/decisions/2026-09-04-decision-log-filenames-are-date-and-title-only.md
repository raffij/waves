# 2026-09-04. Decision-log filenames are date and title only, no counter

- **Date:** 2026-09-04
- **Status:** Accepted

## Context

The log started at `NNNN-title.md` (`0001`, `0002`, …), numbered in the
order records were written. That sorts by creation order but tells you
nothing about *when* a decision was made without opening the file, and the
running counter is a small piece of shared state: two branches in flight at
once both reach for the next free number, and whichever merges second has a
filename collision or a silent renumber to sort out.

A first pass ([2026-09-03](2026-09-03-wind-direction-added-app-only.md) was
still open at the time) moved to `YYYY-MM-DD-NN-title.md` — date first for
chronological sort, plus a two-digit `NN` to order same-day records. The
`NN` kept the same drift problem the bare `NNNN` had, just scoped to a
single day: it's still a counter two people can pick the same value for,
still needs bumping by hand, still goes out of sync.

## Decision

Name decision files `YYYY-MM-DD-title.md` — the record's own `**Date:**`
plus its existing title slug, nothing else. No sequence counter at any
scope.

- Same-day records are disambiguated by their title slug, which is already
  unique, so filenames never collide.
- Same-day *ordering* is given up. It was rarely meaningful (most same-day
  records don't depend on each other), and where the order actually matters
  the record already spells it out in prose ("recorded earlier today, …").
  `README.md` and `AGENTS.md` now say this explicitly.
- Cross-references between records — both markdown links and inline prose
  mentions like "decision 0003" — become links whose visible text is the
  date, e.g. `[2026-09-01](2026-09-01-clothing-advice-matches-actual-wardrobe.md)`.
  The date isn't unique on its own, but the link target is, so a reader can
  always click through to exactly one record.
- `TEMPLATE.md` and `AGENTS.md`'s naming rule are updated to match, and the
  one in-code reference (`expo/src/services/DayInsights.ts`) points at the
  new slug.

Alternatives considered:

- **Keep `YYYY-MM-DD-NN-title.md`.** Rejected: the `NN` is the exact piece
  of drift-prone shared state this change exists to remove. Its only job —
  same-day ordering — isn't worth a hand-maintained counter.
- **Drop the date, keep a plain title slug (`title.md`).** Loses the
  chronological sort in a directory listing, which is the main thing the
  log is read as.
- **A monotonic timestamp (`YYYY-MM-DDTHHMM-title.md`) for true ordering.**
  Precise but ugly, and it implies the minute a decision was "made" is
  knowable and worth recording; it isn't.

## Consequences

Filenames now say when at a glance and sort chronologically, and there's no
counter for concurrent branches to fight over — a new record is just
today's date and a title. Every existing file was renamed and every
cross-reference relabelled in one pass, so no dangling `NNNN` links remain.
The cost is that same-day records no longer carry their authoring order in
the filename; it lives in the prose when it matters.

## Diagram

No system-map impact — this is a documentation-convention change. It
touches no component, connection, or boundary in `docs/architecture/`.
