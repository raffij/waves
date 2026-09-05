# Decision log

Lightweight architecture decision records (ADRs) for this repo. Each file is
one decision: what was decided, why, and what it costs. See `AGENTS.md` for
when a decision needs one of these and when it also needs a diagram update.

Ordered by date, oldest first — the filename is `YYYY-MM-DD-title.md`, with
no sequence counter. Same-day decisions have no defined order between them;
if it matters, the record's own text says which came first. Use
`TEMPLATE.md` to start a new one.

| Date | Decision | Status |
| --- | --- | --- |
| [2026-08-31](2026-08-31-adopt-a-decision-log.md) | Adopt a decision log | Accepted |
| [2026-08-31](2026-08-31-combine-day-insights-readout.md) | Combine the day-insights readout | Accepted |
| [2026-09-01](2026-09-01-clothing-advice-matches-actual-wardrobe.md) | Clothing advice matches the user's actual wardrobe | Accepted |
| [2026-09-01](2026-09-01-mild-band-treated-as-shorts-weather.md) | The mild feels-like band is treated as shorts weather | Accepted |
| [2026-09-01](2026-09-01-weather-response-shapes-live-in-models.md) | Weather response shapes live in `models/`, not in `WaveAPIClient.ts` | Accepted |
| [2026-09-02](2026-09-02-sandals-win-over-boots-when-mild-and-wet.md) | Sandals win over walking boots when it's mild and wet | Accepted |
| [2026-09-02](2026-09-02-clothing-advice-split-by-time-of-day.md) | Clothing advice splits into a core-hours pick and a rest-of-day pick | Accepted |
| [2026-09-02](2026-09-02-mild-wet-days-get-a-light-jacket-and-umbrella.md) | Mild/warm/hot wet days get a light jacket, with an umbrella when calm | Accepted |
| [2026-09-02](2026-09-02-clothing-core-hours-widened-to-8-17.md) | Clothing core hours widen from 08:00–16:00 to 08:00–17:00 | Accepted |
| [2026-09-02](2026-09-02-replace-biome-with-oxlint-and-oxfmt.md) | Replace Biome with oxlint and oxfmt | Accepted |
| [2026-09-03](2026-09-03-rain-clause-describes-intensity-trend.md) | The rain clause describes how a spell's intensity changes | Accepted |
| [2026-09-03](2026-09-03-heavy-rain-mild-days-get-a-coat-not-a-dry-robe.md) | Heavy rain on a mild/warm/hot day gets a coat, not a dry robe | Accepted |
| [2026-09-03](2026-09-03-wind-direction-added-app-only.md) | Wind direction is added to the app only, with a backing/veering readout | Accepted |
| [2026-09-03](2026-09-03-sea-current-and-sea-temperature-from-marine-api.md) | Surface sea current direction and sea surface temperature from Open-Meteo Marine | Accepted |
| [2026-09-03](2026-09-03-wind-gusts-added-to-chart-and-insights.md) | Wind gusts are added to the tide chart and the day-insights sentence | Accepted |
| [2026-09-04](2026-09-04-cool-band-treated-as-shorts-and-socked-sandals-weather.md) | The cool band is treated as shorts-and-socked-sandals weather | Accepted |
| [2026-09-04](2026-09-04-decision-log-filenames-are-date-and-title-only.md) | Decision-log filenames are date and title only, no counter | Accepted |
| [2026-09-04](2026-09-04-adopt-vitest-for-the-service-layer.md) | Adopt Vitest for the service layer, on Node 24 LTS | Accepted |
| [2026-09-04](2026-09-04-day-insights-split-by-weather-domain.md) | Day-insights logic splits into one module per weather domain | Accepted |
| [2026-09-04](2026-09-04-cache-node-modules-in-ci.md) | Cache `expo/node_modules` across CI and deploy via a shared composite action | Accepted |
| [2026-09-05](2026-09-05-swim-card-generator.md) | Add a standalone CLI generator for a shareable swim-report card | Accepted |
| [2026-09-05](2026-09-05-beach-water-quality-flags.md) | Swim-card beach flags use the Environment Agency's bathing-water data, as a best-effort unverified integration | Accepted |
| [2026-09-05](2026-09-05-app-water-quality-check.md) | The Expo app checks bathing-water pollution status too, reusing the swim-card's unverified EA integration | Accepted |
| [2026-09-05](2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md) | Bathing-water lookups convert to OSGB36 easting/northing instead of guessing lat/long/dist | Accepted |
