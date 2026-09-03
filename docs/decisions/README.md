# Decision log

Lightweight architecture decision records (ADRs) for this repo. Each file is
one decision: what was decided, why, and what it costs. See `AGENTS.md` for
when a decision needs one of these and when it also needs a diagram update.

Numbered sequentially, oldest first. Use `TEMPLATE.md` to start a new one.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-adopt-a-decision-log.md) | Adopt a decision log | Accepted |
| [0002](0002-combine-day-insights-readout.md) | Combine the day-insights readout | Accepted |
| [0003](0003-clothing-advice-matches-actual-wardrobe.md) | Clothing advice matches the user's actual wardrobe | Accepted |
| [0004](0004-mild-band-treated-as-shorts-weather.md) | The mild feels-like band is treated as shorts weather | Accepted |
| [0005](0005-weather-response-shapes-live-in-models.md) | Weather response shapes live in `models/`, not in `WaveAPIClient.ts` | Accepted |
| [0006](0006-sandals-win-over-boots-when-mild-and-wet.md) | Sandals win over walking boots when it's mild and wet | Accepted |
| [0007](0007-clothing-advice-split-by-time-of-day.md) | Clothing advice splits into a core-hours pick and a rest-of-day pick | Accepted |
| [0008](0008-mild-wet-days-get-a-light-jacket-and-umbrella.md) | Mild/warm/hot wet days get a light jacket, with an umbrella when calm | Accepted |
| [0009](0009-clothing-core-hours-widened-to-8-17.md) | Clothing core hours widen from 08:00–16:00 to 08:00–17:00 | Accepted |
| [0010](0010-replace-biome-with-oxlint-and-oxfmt.md) | Replace Biome with oxlint and oxfmt | Accepted |
| [0011](0011-rain-clause-describes-intensity-trend.md) | The rain clause describes how a spell's intensity changes | Accepted |
| [0012](0012-wind-direction-added-app-only.md) | Wind direction is added to the app only, with a backing/veering readout | Accepted |
