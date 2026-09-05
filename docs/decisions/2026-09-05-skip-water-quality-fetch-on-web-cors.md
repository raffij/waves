# 2026-09-05. Skip the water-quality fetch on web — environment.data.gov.uk sends no CORS headers

- **Date:** 2026-09-05 (same day as, and after,
  [2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md](2026-09-05-bathing-water-lookup-uses-os-grid-not-latlong.md))
- **Status:** Accepted

## Context

The user ran the app for real (this sandbox still can't reach
`environment.data.gov.uk` at all) and reported CORS errors from
`WaterQualityClient`'s fetch. That's the Expo **web** build specifically —
CORS is a browser-enforced mechanism; it doesn't apply to the iOS/Android
builds' native `fetch()`. This confirms something the two prior bathing-
water decisions had left an open question: the EA's Bathing Water Quality
API sends no `Access-Control-Allow-Origin` header, so a browser is blocked
from reading the response outright, regardless of whether the query shape
or field-name guesses in `WaterQualityClient.ts` are otherwise right.

`fetch()`'s existing try/catch already turns this into a graceful
`'unknown'` result rather than crashing anything — that part of the
"never guess clear" design already works as intended. But letting the
request go out anyway on web is pure waste: it's guaranteed to fail every
time (not just on a bad request), it prints a CORS error to the console on
every load/refresh (which a catch block can't suppress — that's the
browser's own devtools reporting, not something JS error handling
controls), and it burns a network round-trip for a result we already know
in advance.

## Decision

Skip the network attempt entirely when `Platform.OS === 'web'`,
short-circuiting to the same `unknownResult()` the catch block already
returns on any other failure. No proxy, no `mode: 'no-cors'` workaround
(that would make the response opaque/unreadable, defeating the point of
fetching it at all) — those add a third-party dependency or a dead end,
for a feature that would still just show "Unknown" either way.

Rejected: routing through a public CORS proxy (corsproxy.io,
api.allorigins.win, etc.) — adds an unrelated third party with no uptime
or privacy guarantee in the request path for every web user, for a
feature that's already just a best-effort overlay. Not worth it unless the
EA later documents an official CORS-friendly endpoint or this repo grows
a server component of its own to proxy through (this repo currently has
none, by design — see `docs/architecture.md`).

This only touches `expo/src/services/WaterQualityClient.ts`. Swim-card's
`beachQuality.mjs` runs under Node, not a browser, so it was never
affected by this — Node's `fetch()` doesn't enforce CORS.

## Consequences

Water quality will always read "Unknown" on the web build until this API
gains CORS support, a server-side proxy exists, or the platform check is
revisited — a real, known limitation, not a bug to chase further. iOS and
Android are unaffected and still get whatever the query/field-name guesses
in the two prior decisions produce once run against the real service.

## Diagram

No diagram impact: this doesn't add, remove, or change a component,
connection, or boundary — `expoClient`'s connection to the EA endpoint in
both architecture diagrams already represents the attempt in the abstract,
and still does; which platforms within "Expo App" make that attempt is
finer-grained than either diagram depicts.
