# 2026-09-04. Adopt Vitest for the service layer, on Node 24 LTS

- **Date:** 2026-09-04
- **Status:** Accepted

This is the first of two records written together on 2026-09-04; it comes
first. The second,
[2026-09-04](2026-09-04-day-insights-split-by-weather-domain.md), splits
`DayInsights.ts` and relies on the suite this record adds.

## Context

`expo/` had no test runner and no tests. The day-insights readout
(`DayInsights.ts`) is the most logic-dense module in the repo — a pile of
banding thresholds and past/today/future prose rules feeding one output
string — and it was about to be broken into a directory of smaller
modules. A move like that wants a behaviour lock: fixed inputs pinned to
their exact output, run before and after, so "no behaviour changed" is
demonstrated rather than asserted.

The service layer (`src/services/`, `src/models/`) is plain TypeScript —
date math, interpolation, string assembly — with no React Native runtime
and no component imports. It runs under Node directly.

CI (`ci.yml`, `deploy-web.yml`) ran Node 20, which enters maintenance in
2026. Current Vitest requires Node 22+.

## Decision

Add **Vitest** as the test runner, scoped to the service layer, and move
the build to **Node 24** (the current LTS) so it runs.

- `actions/setup-node` in both `ci.yml` and `deploy-web.yml` goes from
  `node-version: 20` to `24`. Node 24 is Active LTS; 20 was a year from
  end-of-life. `vitest` is a dev dependency on the current major (`^5.0.0`),
  whose engine floor is Node 22.
- `npm test` → `vitest run`, `npm run test:watch` → `vitest`. CI
  (`ci.yml`) gains a `Test` step alongside `Lint` and `Typecheck`.
- `vitest.config.mts` sets `environment: 'node'` and restricts `include`
  to `src/services/**/*.test.ts` and `src/models/**/*.test.ts`, so Vitest
  never loads a component file that imports `'react-native'`. The config
  is `.mts` because the repo's `package.json` has no `"type": "module"`
  and Vitest's native config loader warns on ESM in a `.ts` loaded as
  CommonJS.
- First suite: `src/services/dayInsights/dayInsights.test.ts`, a
  characterisation suite — 35 fixed `DayInsightsInput` cases across every
  clause, each pinned to its exact readout sentence with
  `toMatchInlineSnapshot`. `vi.setSystemTime` freezes "now" so the
  past/today/future branches are deterministic.

**Alternatives considered.**

- *Stay on Node 20, take Vitest 3.* Vitest 3 still supports Node 20, so
  this needs no runtime bump. Rejected: Node 20 is nearly EOL, the bump
  was coming regardless, and doing it now means the test runner tracks the
  current major instead of starting a version behind. The first push of
  this branch tried exactly this (`vitest@^3.2.7` on Node 20); it's in the
  history.
- *`jest-expo` / `jest`.* The Expo-blessed path, and the right choice
  for testing components against the React Native runtime. Heavier to set
  up, slower, and Jest rather than Vitest — and nothing here needs the RN
  runtime. If component tests are wanted later, `jest-expo` can be added
  alongside Vitest (each scoped to its own file glob); this decision
  doesn't preclude that.
- *No runner, just a scratch script.* Rejected — the point is a suite CI
  runs on every PR and that new service-layer logic can extend, not a
  one-off.

## Consequences

`npm ci` now pulls Vitest's tree — ~90 packages, most of them `vite` /
`esbuild` / `rollup` platform binaries — and the lockfile grew
accordingly. CI gains a fourth check.

The Node bump touches the web deploy too: `deploy-web.yml` runs
`npx expo export` on Node 24. Expo 57 supports current LTS, but the first
green run of `deploy-web.yml` on `main` after this merges is the real
confirmation. Contributors need Node 22+ locally now (`expo/README.md`
says Node 24); an older Node fails `npm test` on the engine check.

There's a place for service-layer unit tests now, and the norm that a
tricky pure function gets one. Component and hook testing is still
unaddressed — a deliberate scope limit, not an oversight.

## Diagram

No system-map impact. This adds a dev-tooling dependency, a test file, and
a CI runtime-version bump; it introduces no component, data source, or
connection. No Archify diagram covers test tooling or the build runtime.
