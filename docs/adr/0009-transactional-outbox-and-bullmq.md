# 0009. Transactional outbox plus BullMQ for async work

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the outbox relay (5s cron, batching, `SKIP LOCKED`, dead-letter + replay) and queue consumers.

## Context

Domain changes must publish events exactly when the data commits — dual-writing to the database and a broker loses events on crash, and in-process-only events die with the process.

## Decision

Transactional outbox: domain changes and their outgoing events commit in the same Postgres transaction. A relay polls with `SKIP LOCKED`, publishes to BullMQ with the outbox ID as idempotent job key, retries with backoff, and parks exhausted events in a replayable dead-letter state (`replayDeadLetter` exists for a reason).

## Consequences

Gain: at-least-once delivery without distributed transactions; crashes lose nothing; retries and dead letters are observable, not hopeful. Pay: 5-second relay latency floor, outbox table needs retention pruning, and consumers must be idempotent (enforced by job IDs, but every handler author must still think about it).

## Alternatives considered

- Dual-write (DB then emit): rejected, the crash window between the two writes silently drops events.
- In-process events only: rejected, dead on crash and invisible across replicas.
- Kafka/RabbitMQ as primary broker: rejected, separate infrastructure to run for guarantees Postgres + BullMQ already provide here.
