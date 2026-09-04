# 2026-09-04. The cool band is treated as shorts-and-socked-sandals weather

- **Date:** 2026-09-04
- **Status:** Accepted

## Context

Decision [2026-09-01](2026-09-01-mild-band-treated-as-shorts-weather.md) moved the
`mild` feels-like band (14–19°C) onto shorts and bare sandals, leaving
`cool` (10–14°C) on the original cold-weather pairing: trousers and camper
shoes, with `cold` and `hot` untouched at either end. On a day reading in
the `cool` band, the user reported actually wearing a jumper, shorts,
sandals, and socks — trousers and camper shoes overstate what `cool` needs
on the bottom half of the body, but bare sandals understate it: `cool` is
warm enough for shorts, not warm enough for bare feet.

## Decision

Move `cool` from the trousers/camper-shoes side of `BOTTOM_FOR_TEMP` and
`FOOTWEAR_FOR_TEMP` onto shorts, joining `mild`/`warm`/`hot`, and give it a
distinct footwear value rather than sharing `mild`'s bare sandals:
`FOOTWEAR_FOR_TEMP.cool` becomes `'sandals with socks'` (reintroducing the
value decision [2026-09-01](2026-09-01-mild-band-treated-as-shorts-weather.md) dropped as unused once `mild` moved off it).
`BOTTOM_FOR_TEMP.cool` becomes `'shorts'` (was `'trousers'`). `TOP_FOR_TEMP.cool`
is untouched — still `'a jumper'`, matching what the user actually reported
wearing — and `cold` keeps trousers/camper shoes unchanged.

`WET_OVERRIDE_TEMP_BANDS` (which forces a dry robe and walking boots on
`cold`/`cool` wet days, regardless of rain intensity) is deliberately left
as `['cold', 'cool']`. The user's report was about today's actual, dry
outfit; nothing here says whether a wet `cool` day should still reach for
sandals-with-socks or fall back to boots, and the wet-weather override was
designed for a `cool` band whose dry default was already non-waterproof
camper shoes — swapping to a different non-waterproof default (socked
sandals) doesn't change that reasoning. Revisiting the wet override for
`cool` is left for if/when the user reports an actual wet-`cool`-day outfit
to calibrate against, the same way each prior clothing decision in this log
was driven by a real forecast rather than a guess.

An alternative — retuning `TEMP_BAND_COOL_C`/`TEMP_BAND_MILD_C` so today's
reading landed in `mild` instead — was rejected for the same reason [2026-09-01](2026-09-01-mild-band-treated-as-shorts-weather.md)
rejected it: it would also change the temperature *sentence* ("it feels
cool" → "it feels mild"), misdescribing the actual temperature just to
reach a clothing pick. It would also have merged `cool` into `mild`'s bare
sandals rather than produced the socked-sandals pick the user actually
wore.

## Consequences

A day reading "it feels cool, around 11–13°C" now advises "Wear a jumper
and shorts, with sandals with socks" instead of "...trousers, with camper
shoes." `cold` and `mild`/`warm`/`hot` are unchanged. Wet-weather behavior
for `cool` is unchanged (still a dry robe and walking boots) pending a real
wet-`cool`-day data point.

## Diagram

No diagram update is needed: this changes clothing-advice table values
inside `DayInsights.ts`, not any system component, connection, or boundary
shown in `docs/architecture/`.
