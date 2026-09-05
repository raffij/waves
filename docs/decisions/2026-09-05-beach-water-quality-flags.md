# 2026-09-05. Swim-card beach flags use the Environment Agency's bathing-water data, as a best-effort unverified integration

- **Date:** 2026-09-05 (same day as, and after,
  [2026-09-05-swim-card-generator.md](2026-09-05-swim-card-generator.md))
- **Status:** Accepted

## Context

After `tools/swim-card/` shipped with the per-beach flag badge/pins dropped
as purely decorative (see the superseded bullet in
[2026-09-05-swim-card-generator.md](2026-09-05-swim-card-generator.md)),
the user corrected that: the flag positions are meant to reflect real
water quality, computed from the water companies' latest storm-outflow
data. That matches what the original mockup's own footer already credited
("© Southern Water CC BY 4.0 · Environment Agency") — this tool had been
built without reading that footer closely enough.

Constraint discovered while acting on the correction: this sandboxed
session's outbound network access is blocked to every domain that could
confirm the real integration — `environment.data.gov.uk` (the Environment
Agency's open-data platform), `southernwater.co.uk` (Rivers and Seas Watch,
Southern Water's own near-real-time storm-overflow tool, successor to
Beachbuoy), and `streamwaterdata.co.uk` (the Water UK-backed National Storm
Overflow Hub, an ArcGIS-hosted aggregate across all English water
companies). `WebSearch` still works and confirmed all three services are
real and roughly what they're rumored to be, but `WebFetch` against any of
their actual pages returns `EGRESS_BLOCKED` — so none of their exact
request/response shapes could be verified live from here, only inferred
from search-result snippets and general training knowledge.

Asked the user how to proceed given that constraint; chosen: **implement
the best-documented understanding now, clearly flagged as unverified**,
rather than wait, or hand back a stub with nothing wired up. The tool runs
on the user's own machine, which has no such egress block — verifying and
fixing the integration for real is a fast loop for them, not a blocker on
shipping something.

## Decision

Add `tools/swim-card/src/beachQuality.mjs`, wired into `compute.mjs` (a new
`beachFlags` field on `CardData`) and fetched in `cli.mjs` independently of
tide/weather (its own `Promise.all` slot — a failure here never blocks the
rest of the card, same "fetched independently" pattern
`WaveAPIClient.ts` uses for wave vs. wind/precipitation):

- Queries the **Environment Agency's Bathing Water Quality** Linked Data
  API (`environment.data.gov.uk`) by each beach's lat/long, chosen over
  attempting Southern Water's/Water UK's raw storm-overflow telemetry
  because it's the older, more established of the two data families —
  training-data recall of its general Linked Data conventions (shared with
  the EA's flood-monitoring/rainfall APIs, e.g. lat/long/dist query
  params) is more grounded than for the newer storm-overflow hub, which
  this session found no way to inspect at all. This is still a **guess at
  the exact query shape and response field names** — `beachQuality.mjs`
  says so in a large header comment, and `tools/swim-card/README.md` says
  so for anyone about to use it.
- **The one invariant that isn't negotiable regardless of how wrong the
  guessed request shape turns out to be: never resolve ambiguity to
  "clear".** A request failure, a non-OK response, an unrecognized JSON
  shape, or no bathing water found near a beach's coordinates all resolve
  to a third status, `'unknown'` — rendered as its own dashed, gray pin
  style distinct from the green "clear" ring and coral "flagged" fill, and
  counted separately in the header badge (`"2 BEACHES FLAGGED · 1
  UNKNOWN"`, or `"FLAGS UNKNOWN"` if every lookup failed). A wrong
  "unknown" costs a beach an icon; a wrong "clear" is a false safety claim
  — those aren't symmetric failure modes, so the code is written to only
  ever fail toward the cheap one.
- Rejected scraping the EA's HTML bathing-water profile pages (which do
  show a live "pollution risk forecast" sentence per site) instead of
  using their structured API surface: more fragile against markup changes,
  and murkier on terms-of-use than a documented open-data API.
- `sampleData.mjs` gains `sampleBeachFlags()` — a fixed clear/flagged/
  unknown mix (not all-clear) so `--sample` previews all three pin states
  and all three badge phrasings at once, rather than only ever "all clear".

## Consequences

The card now shows a real (if unverified) per-beach flag reading instead of
a decorative one, matching what the user actually wanted. Whoever runs this
for real needs to treat the first run as the actual verification step: if
`environment.data.gov.uk` rejects the query shape, every beach will read
`'unknown'` rather than silently lying — that's the intended degraded
state, not a bug to route around by relaxing the "never guess clear" rule.

Follow-up, not done here: confirm the real query/response shape against
live docs and fix `beachQuality.mjs` accordingly; the `FLAGGED_CLASSIFICATIONS`
mapping only reads the EA's seasonal bathing-water classification
(excellent/good/sufficient/poor), not the finer-grained live storm-overflow
discharge events the user specifically described ("latest outflow data
from the water companies") — wiring in Southern Water's Rivers and Seas
Watch or the Water UK storm-overflow hub directly, once one of their exact
endpoints can actually be confirmed, would be a closer match and a
follow-up worth doing.

## Diagram

No diagram impact, for the same reason as the parent decision: this is
part of a one-shot CLI outside the four-client system map
`docs/architecture/waves.architecture.json` depicts. It also isn't a
TideCheck/Open-Meteo call, so it wouldn't fit that diagram's existing
tide/wave framing even if the CLI itself were in scope for it.
