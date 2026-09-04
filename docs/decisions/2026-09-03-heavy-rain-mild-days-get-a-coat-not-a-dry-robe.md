# 2026-09-03. Heavy rain on a mild/warm/hot day gets a coat, not a dry robe

- **Date:** 2026-09-03
- **Status:** Accepted

## Context

Decision [2026-09-02](2026-09-02-mild-wet-days-get-a-light-jacket-and-umbrella.md) made
the wet-weather top depend on rain intensity as well as temperature: a dry
robe for `heavy` rain regardless of temperature band, a light jacket for
lighter rain on `mild`/`warm`/`hot` days. Against a real forecast (mild,
14–17°C, drizzle building to heavy rain from 15:00 to 21:00), the user said
the dry robe is wrong here — they'd wear a coat, same as they would for any
rain on a day that isn't freezing. Their rule: the dry robe is for wet *or*
really cold days; the coat is for a bit of rain when it isn't freezing. In
other words, once it's cold/cool enough to need the robe (the same
`WET_OVERRIDE_TEMP_BANDS` footwear already keys off), rain intensity stops
mattering — and once it's warm enough not to need the robe, rain intensity
*still* doesn't matter, because the robe was never really about the
downpour, it's about the cold.

## Decision

Drop the `rainBand === 'heavy'` clause from the wet-top pick in
`pickForSegment`. The wet top is now decided by temperature band alone:
`WET_TOP` ('a dry robe') for `cold`/`cool`, `WET_LIGHT_TOP` for
`mild`/`warm`/`hot` — with `WET_LIGHT_TOP` itself renamed from `'a light
jacket'` to `'a coat'`, since it now also covers heavy rain and "light
jacket" undersold what it needs to stand up to. The umbrella extra note
([2026-09-02](2026-09-02-mild-wet-days-get-a-light-jacket-and-umbrella.md)) is unchanged: it still only pairs with `WET_LIGHT_TOP`, gated on a
calm segment.

An alternative — keeping the light-jacket/coat split as two separate items
picked by rain intensity, with only the *heaviest* rain forcing the dry robe
back in for mild+ days — was rejected because it's exactly what the user
pushed back on: they specifically want the coat, not the robe, on the heavy
rain day in question.

## Consequences

The screenshot forecast (mild, drizzle building to heavy rain from 15:00)
now reads "...Wear a coat and shorts, with sandals — carry an umbrella"
during any calm segment, and "...Wear a coat and shorts, with sandals"
otherwise, instead of "...Wear a dry robe and shorts, with sandals." A
cold/cool wet day is unchanged (still the dry robe, at any rain intensity).
`RainBand` is no longer read at all inside `pickForSegment` for the top
pick — only `wet` (`rainBand !== 'dry'`) — though the parameter stays, since
`wet` is still derived from it.

## Diagram

No diagram update is needed: this changes clothing-advice logic inside
`DayInsights.ts`, not any system component, connection, or boundary shown
in `docs/architecture/`.
