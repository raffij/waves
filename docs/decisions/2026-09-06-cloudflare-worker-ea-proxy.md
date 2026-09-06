# 2026-09-06. Route the EA bathing-water fetch through a Cloudflare Worker proxy

- **Date:** 2026-09-06
- **Status:** Accepted

## Context

[2026-09-05-skip-water-quality-fetch-on-web-cors.md](2026-09-05-skip-water-quality-fetch-on-web-cors.md)
established that `environment.data.gov.uk` sends no `Access-Control-Allow-Origin`
header, so the Expo **web** build can't read the Bathing Water Quality API at
all, and made `WaterQualityClient` short-circuit to `'unknown'` on web rather
than fire a request guaranteed to fail. That decision explicitly left the door
open: *"Not worth it unless the EA later documents an official CORS-friendly
endpoint or this repo grows a server component of its own to proxy through."*

The user has a Cloudflare account and the `giraffi.dev` zone on it, and asked
to stand up that server component. So the "web is permanently Unknown"
limitation is now worth removing.

## Decision

Add a single-purpose Cloudflare Worker at **`waves-api.giraffi.dev`**
(`workers/waves-api/`) that forwards an allowlisted slice of the EA Bathing
Water Quality API and adds the missing CORS headers. `WaterQualityClient`'s
base URL changes from `https://environment.data.gov.uk/doc/bathing-water.json`
to `https://waves-api.giraffi.dev/ea/doc/bathing-water.json`; the OSGB36
easting/northing bounding-box query is unchanged.

Specifics:

- **All platforms route through the proxy**, not just web. Native iOS/Android
  aren't subject to CORS, but sending them through the same host means one
  request path, one shared 6h edge cache, and one place to adjust when the EA
  response shape is finally pinned down (see the follow-up below). Native
  loses nothing — it's a base-URL change.
- **GET only, allowlisted path families only** (`doc|id/bathing-water`,
  `data/bathing-water-profile`, `doc|data/bathing-water-quality`). Any other
  path or method is refused. It is deliberately not a general proxy.
- **CORS pinned** to known origins (the GitHub Pages site + localhost dev
  ports), not `*`.
- **6h edge cache** via `caches.default`, keyed on the upstream URL — matches
  `WaterQualityClient`'s own AsyncStorage window and holds EA request volume
  to one upstream hit per distinct query per 6h across all web visitors.
- **The short-term pollution (STP) risk-prediction endpoint is in the
  allowlist too**, though nothing consumes it yet — so adding a "today"
  pollution-risk signal to the app later is a client-only change with no
  infra step. This is the "Classification + STP forecast" proxy scope the
  user chose.
- **Deployed from CI** (`.github/workflows/deploy-worker.yml`) on pushes to
  `main` touching `workers/waves-api/**`, using repo secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `ci.yml`'s
  post-automerge dispatch step triggers it too, matching how `deploy-web.yml`
  is already handled.

`tools/swim-card/src/beachQuality.mjs` is **not** changed — it runs under
Node, which doesn't enforce CORS, and it's a separate tool with its own
decision record. It keeps calling `environment.data.gov.uk` directly.

### Alternatives rejected

- **Public CORS proxy** (corsproxy.io, allorigins, …) — same reasoning as the
  superseded decision: an unrelated third party with no uptime or privacy
  guarantee in every web user's request path. A Worker we own removes that
  objection.
- **`mode: 'no-cors'`** — makes the response opaque and unreadable, defeating
  the point.
- **Keep the web no-op** — the only real cost of the proxy is owning one small
  piece of infra, and that cost is now paid once for a feature that's been
  half-dark since it shipped.
- **Cloudflare Pages Functions / move the whole site off GitHub Pages** — a
  much larger change (new host, new deploy pipeline for the entire app) for no
  benefit over a standalone Worker the existing Pages deploy doesn't need to
  know about.
- **Proxy only web, leave native direct** — would mean two request paths and
  two cache layers for one feature, and two places to fix the response-shape
  guesses. Not worth the smaller diff.

## Consequences

- **This is the repo's first server-side component.** `docs/architecture.md`'s
  "no shared package, no server" framing now has one exception: a Worker that
  sits between the Expo client and one external API. There's a Cloudflare
  account to keep, a `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secret
  pair in the repo, and a fourth GitHub Actions workflow.
- **Water quality can resolve on web now** instead of always reading
  "Unknown" — subject to the response-shape work below.
- **New follow-up, surfaced by testing through the Worker:** early testing
  suggested the `bathing-water.json` list response didn't embed a site's
  classification and that a two-step fetch (list → follow
  `latestComplianceAssessment._about`) would be needed.
  **Resolved 2026-09-06** — see
  [2026-09-06-bathing-water-status-from-single-list-response.md](2026-09-06-bathing-water-status-from-single-list-response.md).
  A real `_view=default` response *does* embed
  `latestComplianceAssessment.complianceClassification.name._value` (and
  `latestRiskPrediction.riskLevel.name._value`) inline, so it stays a
  single request; the bug was that the parsing compared Linked-Data
  `{ _value, … }` objects against `typeof x === 'string'` and always fell
  through to `'unknown'`. The "never guess 'clear'" safety property held
  throughout.
- The Worker's allowlist is kept at the path-family level specifically so that
  two-step fetch — and a later STP integration — won't need a Worker redeploy.

## Diagram

Both architecture diagrams updated to show the proxy as a `cloud` component
between the Expo client and `EA Bathing Water`:

- [`docs/architecture/waves.architecture.json`](../architecture/waves.architecture.json)
  / `.html` — new `wavesApiProxy` node on the `expo-water-quality` path; the
  "Water quality (Expo only)" guided view now includes it.
- [`docs/architecture/webapp.architecture.json`](../architecture/webapp.architecture.json)
  / `.html` — new `wavesApiProxy` node between `waterQualityClient` and
  `eaBathingWaterAPI`; the "Water quality fetch" guided view now includes it.

`insights*` diagrams are unaffected (no water-quality component).
