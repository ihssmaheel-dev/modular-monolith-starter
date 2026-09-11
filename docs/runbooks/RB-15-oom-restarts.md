# RB-15: OOM kills / container restart loops

- **Severity:** SEV-1 if user-facing replicas flap; SEV-2 for workers (work stalls — see RB-08)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Containers restarting on a loop (`docker compose ps` shows recent uptimes / high restart
  counts), host OOM-killer lines (`dmesg | grep -i "out of memory"`), or Node heap errors
  (`JavaScript heap out of memory`) in logs.
- Honest baseline first: **no memory limits are configured on these services today** —
  a runaway process grows until the host kills something, possibly the wrong something.

## Blast radius

Restarting API loses in-memory state only (sessions are cookie/DB-backed, uploads bypass
the API, realtime clients reconnect) — but flapping replicas shed load onto survivors,
which then OOM in turn. Cascading restarts are the failure mode to fear, not one crash.

## Triage in 5 minutes

1. What got killed, and what grew first? Host memory graph + `dmesg` timestamps vs
   container restarts — OOM-killed vs crash-looped are different fixes.
2. Heap or native? `JavaScript heap out of memory` = V8 heap (leak or giant payload);
   silent SIGKILL with no log line = host OOM (something else ate the box, maybe not us).
3. Correlate with deploys and traffic: step-change at release (leak/regrowth per deploy),
   gradual climb over days (slow leak), spike with traffic (payload-driven, not a leak).
4. Check the usual suspects: unbounded in-memory caches, unawaited stream accumulation,
   giant query results without pagination (shouldn't exist — pagination is mandatory,
   verify the endpoint honors it).

## Fix paths

1. **Traffic spike, healthy code:** scale replicas horizontally (stateless API allows it)
   and set explicit memory limits + reservations so one service can't eat the host.
   Rollback: N/A.
2. **Suspected leak:** heap snapshot before restart (`--inspect` + snapshot, or
   `--max-old-space-size` raise as a _diagnostic_ bridge, never the fix), then fix forward.
3. **Worker OOM on big jobs:** chunk sizes and streaming (the file pipeline already chunks;
   verify the failing job honors it). Rollback: previous image if deploy-correlated.

## Verify

- Restart counts flat for 30 minutes; heap growth curve back to sawtooth-normal.
- Full request journey green, not just `/health/live` (a fresh process always passes that).

## Escalate when

- OOM recurs within an hour with no traffic correlation (active leak — code fix, urgently).
- Host-level memory pressure from outside our containers (noisy neighbor — infra call).

## After

- [ ] Postmortem linked here.
- [ ] Memory limits + OOM-kill alerting if this incident proved their absence (it did).
