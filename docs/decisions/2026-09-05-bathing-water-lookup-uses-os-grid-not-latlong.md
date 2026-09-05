# 2026-09-05. Bathing-water lookups convert to OSGB36 easting/northing instead of guessing lat/long/dist

- **Date:** 2026-09-05 (same day as, and after,
  [2026-09-05-app-water-quality-check.md](2026-09-05-app-water-quality-check.md))
- **Status:** Accepted

## Context

The user pointed at <https://environment.data.gov.uk/bwq/profiles/> — the
EA's own "Swimfo" bathing-water-quality site — asking whether we could use
data from there. This session's outbound access to
`environment.data.gov.uk` is still blocked (confirmed again: `WebFetch`
against both that URL and its linked API reference page returns
`EGRESS_BLOCKED`), but `WebSearch` isn't blocked, and search results
surfaced real, load-bearing facts about the actual API that both
`WaterQualityClient.ts` and `beachQuality.mjs` had guessed wrong:

- The base endpoint and JSON format
  (`environment.data.gov.uk/doc/bathing-water.json`) — already coded —
  check out.
- The geographic filter is **not** `lat`/`long`/`dist`. That shape was
  ported from training-knowledge of the EA's *flood-monitoring* API, which
  does take those params — but the bathing-water API filters by
  `min-`/`max-samplingPoint.easting`/`.northing`: OSGB36 British National
  Grid coordinates, a bounding box, not a lat/long radius search.
- Response field names for a site's current classification are still
  unconfirmed — search results mentioned
  `latestComplianceAssessment.complianceClassification` in passing (plus a
  `.name` vs `.label` ambiguity) but never surfaced a full example response
  body.

Asked the user how to close the geographic-filter gap specifically, since
it has two real options: hardcode each fixed location's actual EA site
notation (e.g. Hastings Pelham Beach is `ukj2202-14100`, found via
`WebSearch`), or implement the real WGS84-to-OSGB36 conversion the API
actually needs. Chose the latter — see Decision.

## Decision

Implement the standard Ordnance Survey WGS84→OSGB36 conversion (Helmert
7-parameter datum transform, then the Redfearn Transverse Mercator
projection onto the National Grid) as a small pure-function module,
duplicated independently in both places that need it — no shared package,
per this repo's standing convention:

- `expo/src/services/OsGridRef.ts` (app), with `OsGridRef.test.ts`
  verifying the Transverse Mercator step against Ordnance Survey's own
  published worked example (52°39'27.2531"N 1°43'04.5177"E on OSGB36 →
  easting 651409.903, northing 313177.270) — matches to sub-millimetre
  precision.
- `tools/swim-card/src/osGridRef.mjs` (swim-card CLI), the same algorithm
  hand-ported to plain JS.

Every numeric constant (the WGS84/Airy1830 ellipsoid parameters, the
OSGB36 Helmert transform parameters, the National Grid true-origin/scale
constants) was cross-checked across three independent sources reached via
`WebSearch`+`WebFetch` on non-blocked domains: Ordnance Survey's own guide
(via search snippet), the `OrdnanceSurvey/os-transform` GitHub repo's
`+towgs84=...` proj4 string, and Chris Veness's widely-used
`chrisveness/geodesy` library — all three agreed on the same figures.

Rejected hardcoding each location's exact EA site notation instead: it
would dodge needing this conversion at all, but the app's `Location`
model is meant to support arbitrary future locations (it already has two:
Hastings Pier, Morecambe), and a hardcoded site-ID map doesn't extend to
a location someone adds later the way a coordinate conversion does. The
user was offered both options and chose the conversion.

`WaterQualityClient.ts`'s `fetch()` and `beachQuality.mjs`'s
`fetchNearestClassification()` both now convert their location's lat/long
via `wgs84ToOsGridRef()` and query a ±2000m easting/northing bounding box
(same "2km" intent as the original, wrong `dist=2` guess). The response
field-name guess also gained a couple of new candidates
(`latestComplianceAssessment.complianceClassification.name`/`.label`)
ahead of the old guess, tried in the same never-guess-"clear" fallback
chain as before.

## Consequences

The query this sends is now built from a real, verified understanding of
the API's geographic filter, not a guess ported from an unrelated sibling
API — a meaningfully more likely to actually work request, even though the
response-shape guess is still just that, a guess. The ~100m WGS84/OSGB36
datum-shift imprecision this conversion's Helmert step carries (not
independently verified against a WGS84-in/OSGB36-out ground-truth pair —
see `OsGridRef.ts`'s header comment) is irrelevant at a 2km query radius.

Follow-up, not done here: confirm the response field names for real once
`environment.data.gov.uk` access is available, and fix
`classificationRaw`/`classification`'s guess chain in both
`WaterQualityClient.ts` and `beachQuality.mjs` accordingly.

## Diagram

Updates both `docs/architecture/waves.architecture.json` and
`docs/architecture/webapp.architecture.json`: the connection label from
the app's water-quality client to the EA endpoint changes from
`"lat/long/dist · unverified"` to `"OSGB36 easting/northing bbox"` — no
new component, connection, or boundary, just a label correcting what the
existing connection actually sends. Both redelivered via the Archify CLI
at `--quality showcase`, and `docs/architecture.png`/
`docs/webapp-architecture.png` re-exported to match.
