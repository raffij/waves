# 0004. The mild feels-like band is treated as shorts weather

- **Date:** 2026-09-01
- **Status:** Accepted

## Context

Decision [0003](0003-clothing-advice-matches-actual-wardrobe.md), recorded
earlier today, keyed the clothing tables off the existing feels-like
`TempBand` and put the `mild` band (14–19°C) in trousers with sandals-and-
socks, alongside `cold`/`cool`. In practice the user wears shorts and bare
sandals through the `mild` band too — trousers and socks are overkill at
those temperatures for them specifically. The wardrobe tables encode a
personal preference, not a physical constraint, so they should match how
the user actually dresses rather than a cautious default.

## Decision

Move `mild` from the trousers/covered-feet side of `BOTTOM_FOR_TEMP` and
`FOOTWEAR_FOR_TEMP` to the shorts/sandals side, joining `warm` and `hot`.
`BOTTOM_FOR_TEMP.mild` becomes `'shorts'` (was `'trousers'`) and
`FOOTWEAR_FOR_TEMP.mild` becomes `'sandals'` (was `'sandals with socks'`).
`cold`/`cool` are untouched (still trousers, camper shoes) — only the
`mild` band moves. This leaves `TOP_FOR_TEMP.mild` (`'a jumper'`) as the
only place `mild` still tracks `cold`/`cool`, which is intentional: the
user's objection was to trousers and socks specifically, not to a jumper.
With `mild` no longer using it, `'sandals with socks'` was a value used
nowhere else, so it's dropped rather than kept as an unused string.

An alternative — retuning `TEMP_BAND_MILD_C`/`TEMP_BAND_WARM_C` so 13–16°C
falls into `warm` instead — was rejected because it would also shift the
temperature *sentence* ("it feels mild" → "it feels warm"), misdescribing
the actual temperature just to change the clothing pick. The clothing
tables and the temperature wording read off the same band by design (see
0003), so retuning the band moves both; overriding the two `_FOR_TEMP`
entries directly moves only the one thing that needed to change.

## Consequences

A day reading "it feels mild, around 13–16°C" now advises "Wear a jumper
and shorts, with sandals" instead of "...trousers, with sandals with
socks." `cold`/`cool` keep the previous mild-band footwear/bottom pairing
unchanged. If a future preference change wants shorts to start even
earlier (into `cool`), it's the same one-line edit to these two tables.

## Diagram

No diagram update is needed: this changes clothing-advice table values
inside `DayInsights.ts`, not any system component, connection, or boundary
shown in `docs/architecture/`.
