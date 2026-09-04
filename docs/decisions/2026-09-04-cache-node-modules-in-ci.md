# 2026-09-04. Cache expo/node_modules across CI and deploy

- **Date:** 2026-09-04
- **Status:** Accepted

## Context

`npm ci` runs three times per merge: PR checks, the main-branch CI run
dispatched after auto-merge, and the Pages deploy build. Each run was
getting slower. `actions/setup-node`'s `cache: npm` already caches the
`~/.npm` download cache, but `npm ci` still deletes `node_modules` and
re-extracts and re-links every package on every run — that is the part
that had grown.

The three call sites had drifted into three copy-pasted setup blocks, so
any caching change had to be made and kept in sync in three places.

## Decision

Add a local composite action, `.github/actions/expo-deps`, and call it from
all three spots. It:

- keeps `actions/setup-node` with `cache: npm` (warms `npm ci` on a miss);
- restores `expo/node_modules` via `actions/cache`, keyed on the runner OS,
  the resolved Node version, and a hash of `expo/package-lock.json`;
- runs `npm ci` only when that cache key does not hit exactly.

On an unchanged lockfile the install step is skipped and CI restores
`node_modules` from cache instead. This is safe here because CI only lints,
type-checks, tests, and runs `expo export --platform web` — no native
builds — so a Linux `node_modules` tree is fully reusable between runs.

Alternatives considered:

- **Leave it at `cache: npm` only.** Rejected: it caches downloads, not the
  extract/link work that had become the slow part.
- **Cache `node_modules` with `restore-keys` fallback.** Rejected: a tree
  restored from a *different* lockfile is exactly the drift `npm ci` exists
  to prevent. Exact-hit-or-full-install keeps the guarantee.
- **A reusable workflow (`workflow_call`) instead of a composite action.**
  Rejected as heavier than needed; the shared part is four steps, not a
  job, and a composite action drops straight into the existing jobs.
- **Cache across the whole repo (`~/.npm` + `node_modules` + Metro).**
  Deferred: `node_modules` is the current bottleneck; revisit if the
  `expo export` step becomes the long pole.

## Consequences

- One place to change CI dependency setup; the three jobs can't drift.
- First run on a new or changed lockfile is unchanged; subsequent runs skip
  `npm ci` and start from a warm `node_modules`.
- The cache key must change when the Node version changes — handled
  automatically by keying on `steps.setup-node.outputs.node-version` rather
  than a hardcoded string.
- If a `node_modules` cache entry is ever corrupted, that run fails rather
  than silently misbehaving; clearing the key (touch the lockfile, or bump
  the key prefix) is the fix.
- New dependencies still need a committed `package-lock.json` change, which
  rotates the key on its own — no manual cache busting for normal bumps.

## Diagram

No diagram change. The composite action is CI infrastructure; it adds no
component, connection, or boundary to the app architecture in
`docs/architecture/`.
