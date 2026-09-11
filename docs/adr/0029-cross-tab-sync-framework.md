# 0029. Cross-tab sync framework with a fenced experimental broadcast

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** frontend
- **Backfilled:** no — decided during implementation on this date.

## Context

Same user, two tabs: logout in one left the other alive, and tables went stale with no mechanism to converge — while focus-refetch storms were explicitly unwanted.

## Decision

A tiny framework in `src/lib/cross-tab/`: a typed channel factory (the only place `BroadcastChannel` may be constructed), scope helpers (global channels for theme/locale/auth-events, identity-scoped `tanstack-query:{userId}:{tenantId}` so users can never share cache), and per-domain adapters with guards (foreign-user ignore, adopt-session-only-when-logged-out). Query sync uses the official experimental broadcast client, exact-pinned to the Query line, wired effect-only with cleanup. Deliberately not leader election: simultaneous mounts may still fetch twice — documented, not a bug.

## Consequences

Gain: logout propagates instantly, one tab's fetch updates all same-identity tabs with zero extra requests, and future adapters cost ~20 lines. Pay: an experimental dependency (pinned; isolated to one file), and tenant-switch divergence until the tenant adapter lands (documented limitation, heals on next switch/login).

## Alternatives considered

- `refetchOnWindowFocus: true`: rejected, buys freshness with fetch storms — the opposite direction.
- Hand-rolled cache sync: rejected, reimplements (worse) what the official plugin already does.
- Distributed locking for single-fetcher: rejected, coordination machinery outweighing a millisecond-race optimization.
