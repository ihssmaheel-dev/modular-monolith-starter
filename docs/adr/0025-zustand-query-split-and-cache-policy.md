# 0025. Zustand for client state, Query for server state, tuned retention

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** frontend
- **Backfilled:** yes — reconstructed from the store files, query-client defaults, invalidation patterns, and the gcTime reduction (24h → 30min).

## Context

One state manager for everything either can't cache (Zustand alone) or persists awkwardly (Query alone). And an unbounded client cache is a slow memory leak wearing a performance costume.

## Decision

Server state lives in TanStack Query (stale-while-revalidate, dedup, invalidation on mutations, no refetch-on-focus storms); client state (auth session, locale, tenant, theme) lives in persisted Zustand slices. Query retention is 30-minute `gcTime` — long enough to make back-navigation instant, short enough to bound memory (acute on mobile); mutations invalidate instead of relying on TTLs.

## Consequences

Gain: each tool does what it's good at; navigation feels instant without hoarding megabytes. Pay: two mental models to teach ("is this server or client state?"), and the boundary must be defended in review or server state leaks into stores.

## Alternatives considered

- Redux Toolkit: rejected, boilerplate without compensating power for this shape.
- Query-only with persistence: rejected, persist/rehydrate complexity for session-shaped state.
- Day-long gcTime (the original default): retired after audit — retention without invalidation need is just memory cost, steepest on mobile.
