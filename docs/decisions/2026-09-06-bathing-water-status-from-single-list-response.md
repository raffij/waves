# 2026-09-06. Read bathing-water status from the single list response, not a follow-up fetch

- **Date:** 2026-09-06
- **Status:** Accepted

This decision comes _after_
[2026-09-06-cloudflare-worker-ea-proxy.md](2026-09-06-cloudflare-worker-ea-proxy.md)
on the same day — it resolves the "New follow-up" that record left open.

## Context

Every bathing-water record in this repo has carried a ⚠️ "PARTIALLY VERIFIED,
never run against the real service" header since it shipped
([2026-09-05-beach-water-quality-flags.md](2026-09-05-beach-water-quality-flags.md)).
The query shape got pinned down
([2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md](2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md)),
but the **response** field names were still a guess-chain, and the
Cloudflare-Worker record's consequences section recorded a worrying
follow-up: testing through the Worker suggested the `bathing-water.json`
list response *didn't* embed a site's classification — that it was one more
fetch away at `latestComplianceAssessment._about` — which would mean
reworking `WaterQualityClient` into a two-step (list → follow the URL)
fetch.

We now have a real response body: a `bathing-water.json?_view=default`
list query for the Morecambe South sampling point, captured 2026-09-06 and
committed verbatim at
`expo/src/services/__fixtures__/bathing-water-morecambe-south.json`.

## Decision

**One request is enough. No two-step fetch.** The `_view=default` list
response *does* embed everything the feature needs, inline on each
`result.items[]` entry:

- `latestComplianceAssessment.complianceClassification.name._value` — the
  annual revised Bathing Water Directive rating (`"Excellent"` | `"Good"` |
  `"Sufficient"` | `"Poor"`). The earlier worry was wrong: `_about` is a
  reference URL *and* `complianceClassification` is expanded alongside it.
- `latestRiskPrediction.riskLevel.name._value` — the current short-term
  pollution (STP) advisory (`"normal"` | `"increased"`), with an
  `expiresAt` timestamp.
- `name._value` — the bathing water's name.

Concrete changes, applied to both `expo/src/services/WaterQualityClient.ts`
and `tools/swim-card/src/beachQuality.mjs`:

1. **Unwrap the Linked-Data envelope.** Human-readable strings come back as
   `{ _value, _datatype: "langString", _lang }`, sometimes inside a
   one-element array. A small `readLangString()` helper handles object,
   array, and bare-string forms; the old code compared these objects with
   `typeof x === 'string'`, silently got `null`, and so resolved every real
   response to `'unknown'`.
2. **Drop the guess-chain.** The three speculative fallback paths
   (`complianceClassification.label`, `currentClassification.classification.label`,
   `item.classification`) are gone — there is now one confirmed path.
3. **Read `result.items[0]` first** (the real shape), keeping `items[0]` as
   a secondary fallback.
4. **Fold STP risk into the status.** A `riskLevel` of `"increased"` maps to
   `flagged` even when the annual rating is `Good`/`Excellent` — a live
   advisory is exactly the "don't swim today" signal the feature is for.
   This is an override in the **unsafe direction only**: an unrecognised
   risk level never upgrades a site to `clear`.

### Alternatives rejected

- **Two-step fetch (list → follow `latestComplianceAssessment._about`)** —
  what the previous record anticipated. Unnecessary: the data is already in
  the list response. It would have doubled the request count per lookup and
  the Worker cache entries for no gain.
- **Ignore `latestRiskPrediction`** — it's the most time-sensitive part of
  the payload and the whole reason the feature reads "today", not "this
  year". Cheap to include now that the shape is known.
- **Keep the guess-chain as defensive fallback** — dead paths that can only
  mask a future real change. A confirmed single path that degrades to
  `'unknown'` is easier to reason about and keeps the "never guess
  `'clear'`" property intact.

## Consequences

- **The feature actually resolves now.** Before this, every live call
  returned `'unknown'` because the langString objects never matched the
  string check. Web + native both benefit (both route through the proxy).
- **The ⚠️ header comments are downgraded** from "PARTIALLY VERIFIED / never
  run" to "response shape CONFIRMED 2026-09-06", pointing at the fixture and
  the tests as the evidence.
- **New regression surface:** `WaterQualityClient.test.ts` gains a
  response-parsing suite driven by the committed fixture (real `Good`
  response, plus mutated `Poor` / `increased` / array-wrapped / empty /
  unrecognised variants). `tools/swim-card/` still has no test runner, so
  `beachQuality.mjs` got the mirror-image code change but no test.
- **The Worker allowlist already covers the STP path**, so wiring
  `riskLevel` in was a client-only change — as
  [2026-09-06-cloudflare-worker-ea-proxy.md](2026-09-06-cloudflare-worker-ea-proxy.md)
  intended.
- The `_about` URI on `complianceClassification`
  (`.../def/bwq-cc-2015/<n>`) carries the numeric code on the
  `bwq-cc-2015` scale. We read the human name instead; if the display names
  ever localise, switch to parsing that code out of the URI.

## Diagram

No diagram change. The fetch is still a single client → `waves-api` proxy →
EA request on the same path the architecture diagrams already show; this
decision changes what fields are read out of the response, not the set of
components, connections, or boundaries.
