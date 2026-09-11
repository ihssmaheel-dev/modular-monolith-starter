# 0015. Piscina worker threads plus api/worker process roles

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the Piscina pools, `PROCESS_ROLE`, and the worker-separation docs.

## Context

CPU-heavy work (CSV parsing, hashing, batch transforms) on the Node event loop blocks every request sharing the process. And background workers shouldn't compete with request serving for resources.

## Decision

Piscina 5 thread pools for in-process CPU work (pure task functions, no NestJS imports), plus `PROCESS_ROLE` (`api`|`worker`|`all`) so the same image runs as request servers or background workers. Orchestration scales the two roles independently.

## Consequences

Gain: event loop stays responsive under heavy jobs; one image, two scaling knobs; worker code stays pure and testable. Pay: task functions must be serializable and dependency-free (a real constraint on what can move off-thread), and local dev must remember which role is running.

## Alternatives considered

- Everything on the event loop: rejected, one big CSV import stalls all traffic.
- Hand-rolled `worker_threads`: rejected, reinventing pooling, queuing, and error propagation Piscina already provides.
- Separate worker codebase: rejected, deploy skew between API and worker versions.
