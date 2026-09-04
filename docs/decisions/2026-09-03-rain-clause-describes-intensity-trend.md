# 2026-09-03. The rain clause describes how a spell's intensity changes

- **Date:** 2026-09-03
- **Status:** Accepted

## Context

The rain sentence named a single spell by one intensity word, picked off
its wettest hour — "Heavy rain through the afternoon, from 15:00 to 21:00."
The user pointed at a forecast where the hourly rain chart barely registers
at 15:00 and climbs steadily to its heaviest by 20:00–21:00: the sentence's
single "heavy rain" label was true of the end of the spell but flattened
out the buildup the chart itself shows, asking to be "more descriptive
about how the rain pattern changes over the period."

Considered and rejected:
- **Listing per-hour intensity** — too granular for a one-line summary and
  would fight the existing "one flowing sentence" shape (decision [2026-08-31](2026-08-31-combine-day-insights-readout.md)).
- **A separate trend field alongside the sentence** — the readout is
  already one summary string by design; adding a field the caller has to
  splice in itself repeats the mistake decision [2026-08-31](2026-08-31-combine-day-insights-readout.md) undid.
- **Reusing `rainCoverage`'s "through the afternoon" placement phrase for
  intensity too** — placement and intensity are different axes of the same
  spell and can change independently (a spell can sit "through the
  afternoon" and either hold steady or build), so they stay separate
  clauses.

## Decision

`RainSpell` now carries `mms`, the wet hours' mm values in order. A new
`rainIntensityTrend(mms, tense)` bands the first and last third of those
hours (at least one hour each) with the existing `rainBandFor` and, when
they differ, returns a `"building to X"` / `"easing to X"` phrase (tense-aware:
`built to` / `expected to build to` / `building to`, and the `eased`/`ease`
equivalents). It returns `null` for spells shorter than
`RAIN_LONG_SPELL_HOURS` — the same length `rainCoverage` already requires
before it characterises a spell at all, so a short shower still reads as a
single flat label.

The single-spell sentence now leads with the *start* band's noun (via
`RAIN_NOUN[trend.startBand]`) rather than always the peak, appending the
trend phrase when one exists: "Drizzle through the afternoon, building to
heavy rain, from 15:00 to 21:00." When there's no trend (a steady spell, or
one too short to characterise), the sentence is unchanged from before. The
"rain already under way" branch gets the same treatment, but reads the
trend only over the hours still ahead (from now to the spell's end) — the
part already fallen isn't part of "how it changes" going forward.

## Consequences

Any single-spell forecast whose intensity actually changes across the spell
now reads two intensity words instead of one; a spell that holds one band
throughout, or is shorter than `RAIN_LONG_SPELL_HOURS`, is unaffected.
Multi-spell days (`spells.length > 1`) are unchanged — there's no single
start/end to describe within one continuous run there.

## Diagram

No diagram update is needed: this changes sentence-generation logic inside
`DayInsights.ts`, not any system component, connection, or boundary shown in
`docs/architecture/`.
