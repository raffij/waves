# 2026-09-04. Adopt Vitest for the service layer

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

## Decision

Add **Vitest** as the test runner, scoped to the service layer.

- `vitest` as a dev dependency, pinned to the **3.x** line (`^3.2.7`).
  Vitest 5 requires Node `>=22`, but `ci.yml` and `deploy-web.yml` both run
  Node 20 (`actions/setup-node` with `node-version: 20`); Vitest 3 still
  supports `^20`. Moving the whole build off Node 20 is a bigger,
  separate change — when it happens, bumping Vitest with it is a one-liner.
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
There's a place for service-layer unit tests now, and the norm that a
tricky pure function gets one. Component and hook testing is still
unaddressed — a deliberate scope limit, not an oversight.

## Diagram

No system-map impact. This adds a dev-tooling dependency and a test file;
it introduces no component, data source, or connection. No Archify
diagram covers test tooling.
