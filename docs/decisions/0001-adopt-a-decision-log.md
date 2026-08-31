# 0001. Adopt a decision log

- **Date:** 2026-08-31
- **Status:** Accepted

## Context

This repo's design rests on a deliberate, non-obvious tradeoff — four
clients that share no fetch/parse code — plus a string of smaller calls
(disable query retries, skip caching on the widgets, fetch wave and
wind/rain independently) that are easy to re-litigate or accidentally
undo once their reasoning is gone. That reasoning has been living only in
PR descriptions and code comments, neither of which is searchable as "why
did we do X" once the PR list gets long or a comment gets moved.

## Decision

Record any architecture-level or hard-to-reverse decision in
`docs/decisions/` as a short ADR (`docs/decisions/TEMPLATE.md`), written at
decision time, listing the alternatives considered. When the decision
changes what a `docs/architecture/` diagram shows, update and redeliver
that diagram in the same change rather than as a follow-up.

Considered and rejected: relying on PR descriptions alone (not searchable
after merge, easy to lose in a squash); a single running `CHANGELOG`-style
doc (loses the per-decision context and alternatives-considered structure
an ADR forces).

## Consequences

Slightly more writing per architecture-affecting change. In exchange, the
"why" behind a decision like "why don't the widgets share a cache" survives
independent of git history, and a diagram never quietly drifts out of sync
with the decision that should have updated it.

## Diagram

No system-map impact — this decision is about process, not components.
