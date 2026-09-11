# 0051. Native `validateSearch` over nuqs for URL state

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** frontend
- **Backfilled:** no — decided during evaluation on this date.

## Context

Type-safe URL state (pagination, tokens, filters) needed a story. nuqs is the popular answer — in Next.js, where search-param ergonomics are genuinely painful.

## Decision

TanStack Router's native `validateSearch` with our shared Zod schemas. nuqs was evaluated and rejected: its own docs defer TanStack Router users to the built-in APIs, its TSR adapter is experimental, and per-component parsers would create a second source of truth that can disagree with route schemas. Our schemas already live in `@repo/contracts`, so validation is shared with the API for free.

## Consequences

Gain: one schema per route, full inference in `Link`/`navigate`/`useSearch`, zero new dependencies. Pay: every param needs an explicit schema entry — no ad-hoc query strings, by design.

## Alternatives considered

- nuqs: rejected per above; would be the right call in a Next.js app, which this is not.
- Unvalidated `Record<string, unknown>` parsing: rejected, pushes stringly-typed bugs to runtime.
