# 0010. Replace Biome with oxlint and oxfmt

- **Date:** 2026-09-02
- **Status:** Accepted

## Context

`expo/` used Biome (`@biomejs/biome`) as a single tool for both linting and
formatting, configured in `expo/biome.json` and run via `npm run lint` /
`npm run lint:fix`. The Oxc project now ships that same lint+format split as
two separate, Rust-based CLIs — `oxlint` and `oxfmt` — that are faster and
under more active development than Biome for this use case.

## Decision

Replace `@biomejs/biome` with `oxlint` (linter) and `oxfmt` (formatter):

- `expo/biome.json` is removed; `expo/.oxlintrc.json` and
  `expo/.oxfmtrc.json` replace it. `oxfmt`'s `--migrate=biome` flag ported
  the formatting options (single quotes, 2-space indent, 120-char line
  width) directly from `biome.json`.
- `expo/.oxlintrc.json` enables the same plugin set oxlint turns on by
  default (`typescript`, `unicorn`, `oxc`) with the `correctness` category
  at `error`, oxlint's closest equivalent to Biome's `recommended` preset.
- `npm run lint` becomes `oxlint . && oxfmt --check .`; `npm run lint:fix`
  becomes `oxlint . --fix && oxfmt .`. CI (`ci.yml`) and the README docs
  call `npm run lint` unchanged, so no workflow edit was needed.
- `expo/.oxfmtrc.json` excludes `**/*.md` and `**/*.html` via
  `ignorePatterns`. Biome only formats JS/TS/JSX/TSX/JSON in this repo (no
  Markdown or HTML support); oxfmt formats those too by default, and
  running it unrestricted reformatted `public/index.html` and
  `targets/widget/README.md` in ways not requested here. Excluding them
  keeps oxfmt's scope equal to what Biome covered.
- The two `biome-ignore` comments (`TideClock.ts`, `public/index.html`)
  are replaced with plain prose — neither the `unicorn/no-static-only-class`
  nor the a11y `useValidLang` rule they suppressed is in oxlint's
  correctness set, so no `oxlint-disable` equivalent is needed.

**Alternative considered:** keep Biome's `assist.source.organizeImports`
behavior (auto-sorting/pruning imports on `lint:fix`) by adding an import
plugin. Neither `oxlint` nor `oxfmt` has an import-organizing feature today,
and oxlint's `--import-plugin` only detects ESM problems, not reordering.
Left out rather than reached for a third tool (e.g. an ESLint import-sort
plugin) just to cover this one feature — the codebase is small enough that
manual import order hasn't been an issue.

## Consequences

Lint/format is now two commands instead of one, but each runs faster.
Contributors relying on `biome check --write` locally need to re-run
`npm install` to pick up the new dev dependencies. Import organizing is no
longer automatic; a follow-up can add it back with a dedicated tool if it
becomes a real pain point.

## Diagram

No system-map impact — this is a dev-tooling swap, not an architecture,
runtime, or data-flow change. No Archify diagram touches lint/format
tooling.
