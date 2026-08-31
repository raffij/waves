# 0002. Combine the day-insights readout

- **Date:** 2026-08-31
- **Status:** Accepted

## Context

The day-insights block had a headline `summary` followed by a separate
`outlook`. Both described the same rain, sunshine, and feels-like temperature
signals, which made the second line feel repetitive and forced related
phrases into a compressed list. The relevant product intent is documented in
[`intent/webapp-day-insights.spec.md`](../../intent/webapp-day-insights.spec.md).

## Decision

Use one deliberately wordy `summary` readout containing several natural
sentences: headline wind and rain conditions, how sunshine and temperature
develop, any light warning, and practical clothing advice. Remove the separate
`outlook` field and render the readout as a single text block. A separate
summary-plus-outlook layout was rejected because it repeats signals and makes
the progression feel detached from the conditions it qualifies.

## Consequences

The readout is easier to scan as one coherent explanation and can use fuller,
more natural phrasing. All parts now share the same time scope, including the
remaining-hours scope used for today. `DayInsights` consumers only need the
`summary` field, while the longer text may take more vertical space in the
forecast view.

## Diagram

No diagram update is needed: this changes user-facing copy and the shape of a
presentational model, but it does not add, remove, or reconnect system
components.
