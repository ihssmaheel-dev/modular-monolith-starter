# 0021. One API client factory per app

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** contracts
- **Backfilled:** yes — reconstructed from `@repo/api-client` (oRPC + REST fallback, middleware chain) and the per-app singletons.

## Context

Auth refresh, tenant headers, locale headers, CSRF, and idempotency keys must ride on every request. Scattered across call sites, half the calls forget half the headers — usually discovered via 403s in production.

## Decision

One typed factory (`createApiClient`) per app, configured once with callbacks (tokens, locale, tenant, refresh, failure). The singleton wires oRPC by default with REST compatibility fallback, auto-refresh with a request coordinator (no refresh stampedes), CSRF, tenant/locale headers, and idempotency keys on mutations. Features import the singleton and call typed subclients — never `fetch`.

## Consequences

Gain: cross-cutting HTTP behavior fixed in one place and tested once; feature code stays business-only. Pay: the factory is load-bearing shared code — changes need care across web and mobile simultaneously.

## Alternatives considered

- Per-feature `fetch` calls: rejected, header discipline decays within weeks; also explicitly rule-banned.
- Axios interceptors per app: rejected, duplicates the same middleware twice with drift between them.
