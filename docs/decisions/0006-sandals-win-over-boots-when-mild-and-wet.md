# 0006. Sandals win over walking boots when it's mild and wet

- **Date:** 2026-09-02
- **Status:** Accepted

## Context

Decision [0003](0003-clothing-advice-matches-actual-wardrobe.md) made any
wet rain band (from the live forecast or leftover ground-wet) force walking
boots outright, regardless of temperature — the reasoning being that none of
the dry-weather footwear is waterproof. In practice, on a mild-or-warmer wet
day (e.g. "it feels mild, around 14–18°C" with showers coming and going) the
user is fine wearing sandals with no socks: it's warm enough, and their feet
were going to get wet from the showers either way. Walking boots and socks
are worse in that case — they soak through and stay wet for the rest of the
day, where bare sandals dry out fast because they're meant to get wet.
Boots still make sense on a cold/cool wet day, where sandals would already
be off the table on temperature grounds alone.

## Decision

Split the wet-footwear override by temperature band instead of applying it
unconditionally. A new `WET_OVERRIDE_TEMP_BANDS` set (`cold`, `cool`) gates
whether rain (`wet`) or leftover ground-wet (`groundWet`) swaps footwear to
`WET_FOOTWEAR` (walking boots); `mild`/`warm`/`hot` stay on
`FOOTWEAR_FOR_TEMP[tempBand]` (sandals) even when it's wet. Top (`WET_TOP`,
a dry robe) is untouched by this change — a robe versus a t-shirt is still a
rain call regardless of temperature, unlike footwear where sandals are
already a "fine with wet feet" choice.

An alternative — dropping the wet-footwear override entirely and keying
footwear off temperature alone — was rejected because cold/cool wet weather
still calls for boots over camper shoes (which aren't waterproof and would
leave feet genuinely cold and wet, not just damp).

## Consequences

A day reading "it feels mild, around 14–18°C" with showers now advises
"Wear a dry robe and shorts, with sandals" instead of "...with walking
boots." Cold/cool wet days are unchanged (still walking boots). Adding a
new temperature band to the sandals side later is a one-line edit to
`WET_OVERRIDE_TEMP_BANDS`, not a rewrite of the override logic.

## Diagram

No diagram update is needed: this changes clothing-advice logic inside
`DayInsights.ts`, not any system component, connection, or boundary shown
in `docs/architecture/`.
