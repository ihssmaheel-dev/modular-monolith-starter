# 0018. Per-instance realtime stream groups for true fan-out

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** no — decided during implementation on this date; see `PRODUCTION_ARCHITECTURE.md` realtime section.

## Context

Realtime events ride a Redis Stream so every API replica can deliver to its local connections. But a single shared consumer group load-balances messages across replicas: a user-targeted event landing on a replica without that connection was acknowledged and lost forever — silent, and worse with every replica added.

## Decision

One consumer group per API replica (`realtime-dispatchers-<instance>`), so every replica receives every event and routes to its local maps. Groups heartbeat with a TTL; `RealtimeStreamReaper` destroys groups whose heartbeat expired; consumers recreate their group on `NOGROUP`. Dead-letter budgets are scoped per group, and `MAXLEN` bounds the stream.

## Consequences

Gain: scale-out is actually correct — broadcasts reach all replicas, targeted events reach the connected one; crash cleanup is automatic. Pay: group lifecycle machinery (heartbeat + reaper) that a single group never needed, and a restarted replica misses events published during its downtime (acceptable: events are live hints over persisted data with poll fallback).

## Alternatives considered

- Single shared group: the status quo ante — rejected, proven lossy at two replicas.
- Redis Pub/Sub instead of streams: rejected, would duplicate the stream machinery and discard at-least-once handling plus dead-lettering already built and tested.
- Presence-tracked routing (know which replica holds whom): rejected, a whole presence system to fix what fan-out solves simply.
