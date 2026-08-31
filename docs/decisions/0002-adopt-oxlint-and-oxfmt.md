# 0002. Adopt Oxlint and Oxfmt for JavaScript tooling

- **Date:** 2026-08-31
- **Status:** Accepted

## Context

The Expo client used Biome for linting and formatting. The project wanted
faster local and CI checks while retaining a committed formatter and linter
configuration for its TypeScript and React code.

## Decision

Use Oxlint for linting and Oxfmt for formatting, replacing Biome. Oxlint's
TypeScript, React and JSX accessibility plugins provide the relevant linting
coverage, while Oxfmt keeps the existing two-space, 120-column and single-quote
formatting choices. Keeping Biome would not address the speed goal, and
splitting the work across ESLint and Prettier would add more runtime and
configuration overhead than the Oxc tools.

## Consequences

The Expo package now has separate `lint`, `format` and check/fix scripts, and
CI runs both lint and format checks. The toolchains have different rule
coverage and formatting edge cases, so future suppressions or formatting
changes must use Oxlint/Oxfmt conventions. Developers gain faster native
tooling at the cost of adopting two early-version Oxc packages.

## Diagram

No diagram update is needed: this decision changes developer tooling only and
does not change the application's runtime components or connections.
