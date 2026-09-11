# 0043. One Redis, five jobs — with graceful degradation

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `DistributedCacheService`, session store, stream consumer, BullMQ, rate limiting, and the `auth:revocations` channel.

## Context

Cache, sessions, realtime streams, job queues, rate limiting, and cross-instance pub/sub each suggest "their own" infrastructure. Five systems means five things to run, back up, and secure — fatal for on-prem simplicity.

## Decision

One Redis serves all five, separated by key namespacing. Every consumer null-guards a missing client: without Redis the API still boots and serves, degrading toward expiry/JWT semantics instead of crashing (revocation, refresh reuse detection, and realtime fan-out log and continue).

## Consequences

Gain: one container locally, one managed service in cloud, one backup story; consistent client and metrics. Pay: a single contention point at scale (mitigated by pooling; split only on evidence) and key-discipline — a colliding prefix would cross wires silently, hence the namespacing rule.

## Alternatives considered

- Per-concern stores (Memcached + RabbitMQ + …): rejected, multiplies on-prem and local-dev burden for theoretical isolation.
- No shared state at all: rejected, kills revocation, rate limiting, and realtime fan-out outright.
