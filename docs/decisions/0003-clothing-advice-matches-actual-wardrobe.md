# 0003. Clothing advice matches the user's actual wardrobe

- **Date:** 2026-09-01
- **Status:** Accepted

## Context

The clothing sentence in the day-insights readout recommended generic rain
gear (a windbreaker, a hooded jacket, an umbrella, waterproofs) picked off a
rain-band × wind-band lookup table, with wind alone deciding the pick. That
wardrobe doesn't match what the user actually owns: sandals (with or without
socks), waterproof walking boots, and camper shoes for footwear; a dry robe,
a jumper, or a t-shirt for a top; shorts or trousers for the bottom. The old
table also had no notion of footwear or bottoms at all, and no temperature
input despite the readout already computing a feels-like band for the
temperature sentence.

## Decision

Replace the single rain × wind garment table with three independent picks —
top, bottom, footwear — each built from `TOP_FOR_TEMP` / `BOTTOM_FOR_TEMP` /
`FOOTWEAR_FOR_TEMP` lookups keyed by the existing feels-like `TempBand`
(`cold`/`cool`/`mild`/`warm`/`hot`), with rain overriding footwear and top
outright: any wet rain band forces walking boots and a dry robe, since none
of the other wardrobe items are waterproof. Footwear also falls back to
walking boots when the ground is merely still wet from earlier rain
(`groundWet`), even once the rain clause itself reads dry. Wind is dropped
from the clothing call entirely — the wardrobe has no wind-specific item
(no windbreaker), so `bandToDressFor`, the umbrella-gust cap
(`UMBRELLA_MAX_GUST_MPH`), and the "Wear"/"Carry" verb switch all become
dead code and are removed with it.

Two alternatives were considered and rejected:
- **Add a footwear clause but keep the rain × wind top table** — rejected
  because the old table's other tops (windbreaker, hooded jacket, rain
  jacket, waterproof shell) aren't in the wardrobe either; keeping it would
  still misdescribe what's actually available to wear.
- **Key footwear and bottom off rain/wind only, ignoring temperature** —
  rejected because it can't distinguish "dry and cold" (camper shoes,
  trousers) from "dry and hot" (sandals, shorts), which is the whole reason
  sandals-with-socks and camper shoes exist as separate options.

## Consequences

The clothing sentence now reads as three coordinated picks, e.g. "Wear a
t-shirt and shorts, with sandals" or "Wear a dry robe and trousers, with
walking boots — still wet underfoot," instead of a single rain-gear noun.
Adding a new wardrobe item in the future means adding one row to the
relevant `_FOR_TEMP` table rather than filling in a whole rain × wind grid.
The tradeoff is that top and bottom no longer vary with wind at all (a windy
dry day and a calm dry day now get the same top) — acceptable here since the
wardrobe has nothing wind-specific to reach for.

## Diagram

No diagram update is needed: this changes clothing-advice logic and the
wording of a presentational model inside `DayInsights.ts`, not any system
component, connection, or boundary shown in `docs/architecture/`.
