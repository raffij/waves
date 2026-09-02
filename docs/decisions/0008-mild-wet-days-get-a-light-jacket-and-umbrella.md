# 0008. Mild/warm/hot wet days get a light jacket, with an umbrella when calm

- **Date:** 2026-09-02
- **Status:** Accepted

## Context

Decision [0007](0007-clothing-advice-split-by-time-of-day.md) kept the
wet-weather top a single, whole-day flag: any rain still ahead meant a dry
robe, at any temperature, at any rain intensity. On a mild day where rain
only shows up later and isn't heavy (e.g. "it should feel mild, around
15–17°C" with 3.3mm of rain from 17:00 to 21:00), a full dry robe is
overkill — the user pointed this out directly against a real forecast. They
also have an umbrella, which decision 0003 had dropped from the wardrobe
entirely on the reasoning that none of the wardrobe's other tops were
rainproof enough to pair with one — but an umbrella only actually works when
it's calm; in wind it's useless or worse.

## Decision

`TOP_FOR_TEMP`'s wet override now depends on both temperature band and rain
intensity, not just "is it wet": `WET_TOP` ('a dry robe') stays unconditional
for `cold`/`cool` (the same `WET_OVERRIDE_TEMP_BANDS` set footwear already
uses) and for genuinely `heavy` rain regardless of temperature — a light
jacket won't hold up to that either way. Everywhere else wet
(`mild`/`warm`/`hot` with `drizzle`/`showery` rain), the top becomes the new
`WET_LIGHT_TOP` ('a light jacket'). `rainBand`, previously collapsed to a
bare `wet` boolean before reaching `pickForSegment`, is now threaded through
so this distinction is available per segment.

The umbrella is reintroduced narrowly, as an `extra` note rather than a
wardrobe item that replaces or joins the top slot: whenever a segment's pick
lands on the light jacket (never the dry robe — already rainproof, an
umbrella adds nothing) *and* that segment's own mean wind reads `calm`
(reusing the existing `WIND_BAND_BREEZY_MPH` threshold via `bandFor`), the
extra clause gains "carry an umbrella". Wind is read per segment here
(unlike `rainBand`/`groundWet`, which decision 0007 deliberately kept
whole-day) because calm-vs-breezy genuinely can differ between the core
hours and the day's edges, and an umbrella note is only actionable for the
segment it's calm in.

An alternative — always pairing the light jacket with an umbrella,
regardless of wind — was rejected because a breezy umbrella is a hazard, not
help, and the wind bands to judge that already exist in this file.

## Consequences

The screenshot forecast now reads "...Wear a light jacket and shorts, with
sandals — carry an umbrella." instead of "...Wear a dry robe and shorts,
with sandals." A cold/cool wet day, or any heavy-rain day regardless of
temperature, is unchanged (still a dry robe, no umbrella suggested). Wind
data being unavailable (`windSeries: null`) silently drops the umbrella note
rather than guessing — consistent with how the rest of the readout treats
missing series.

## Diagram

No diagram update is needed: this changes clothing-advice logic inside
`DayInsights.ts`, not any system component, connection, or boundary shown in
`docs/architecture/`.
