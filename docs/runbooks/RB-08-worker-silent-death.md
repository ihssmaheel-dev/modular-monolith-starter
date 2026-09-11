# RB-08: Worker silent death (no crash, no work)

- **Severity:** SEV-2 (becomes whatever the stalled work becomes — usually RB-05 or RB-07 first)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- The cruel one: process alive, no errors, but nothing gets consumed — heartbeats stop
  while logs go quiet. Watch for `worker:heartbeat:node:*` keys disappearing from Redis
  and the worker health indicator flipping on `/health`.
- Often discovered backwards: outbox lag (RB-05) or stuck queues (RB-07) with healthy
  API and Redis. If you arrived from there, this page is your next step.

## Blast radius

Same as a worker fleet outage (RB-07 path 1) but harder to see: outbox relay, digest
jobs, file workers, and retention purges all quietly stop. Scheduled work (retention,
digests) is lost for the silent window, not delayed — purges don't backfill missed days
unless re-triggered.

## Triage in 5 minutes

1. `SCAN 0 MATCH worker:heartbeat:node:*` in Redis — which nodes checked in recently?
   Missing entirely = fleet down; stale timestamps = specific dead nodes.
2. Worker process list on the host/orchestrator — running but silent, or gone?
3. `PROCESS_ROLE` of the running processes — an `api`-only deploy with no `worker` role
   produces exactly this symptom after every deploy that "changed nothing".
4. Recent deploy diff touching worker registration, cron setup, or Redis connectivity.

## Fix paths

1. **Missing worker role:** start/scale the worker deployment (`PROCESS_ROLE=worker`).
   Rollback: N/A — additive.
2. **Wedged process (alive, silent):** restart it; then check whether scheduled work for
   the silent window needs manual re-trigger (retention purges, digest runs).
3. **Heartbeat writes failing:** Redis connectivity from the worker network identity
   (RB-03) — the worker is fine, its pulse isn't.

## Verify

- Fresh `worker:heartbeat:node:*` keys with current timestamps; health indicator green.
- Backlog metrics (outbox depth, queue depth) draining; manually re-trigger any missed
  scheduled runs and confirm completion.

## Escalate when

- Heartbeats present but no consumption (consumer logic wedged, not the process — code fix).
- Silent window exceeded retention granularity (data may be unrecoverable — decide explicitly).

## After

- [ ] Postmortem linked here.
- [ ] Alert on missing heartbeats if this was discovered manually — silence must page.
