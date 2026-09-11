# RB-03: Redis down (degraded mode, not full outage)

- **Severity:** SEV-2 (degraded by design — read the blast radius before panicking)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Logs show `Redis client error` / `Failed to connect to Redis`; `ready` probe may stay
  green because the API boots and serves without Redis by design.
- Symptoms are partial: refresh-token reuse detection weakened, realtime fan-out stops
  crossing replicas, rate limiting and notification unread-count cache fall back.

## Blast radius

Read this twice: **the API stays up**. Per ADR 0043 every Redis consumer null-guards a
missing client and degrades toward expiry/JWT semantics. What actually breaks: cross-replica
realtime delivery, refresh reuse rejection, distributed rate limiting (each replica limits
locally), cached unread counts. Single-replica deployments barely notice; multi-replica
ones lose coordination first.

## Triage in 5 minutes

1. `redis-cli -h <host> -p <port> ping` (or `docker compose exec redis redis-cli ping`).
   Healthy: `PONG`.
2. `docker compose ps redis` — `healthy` vs `restarting`/`exited`.
3. `docker compose logs --tail=30 redis` — OOM killer lines mean memory, not network (→ RB-04
   if the volume/host is full, else check `maxmemory` policy for the environment).
4. Confirm degradation, not outage: `curl /api/v1/health/live` should still be 200.

## Fix paths

1. **Container down:** `docker compose up -d redis`; no data migration needed (cache/sessions
   rebuild; streams resume from `$` for live events). Rollback: N/A.
2. **Managed Redis (prod) unreachable:** provider status, then security groups/TLS (`rediss://`)
   before touching the app. Rollback: N/A.
3. **Flapping connection:** check `maxRetriesPerRequest`/retry config and network, not the app
   — the app already handles this path; repeated flaps deserve a provider ticket.

## Verify

- `PING` → `PONG`; `Redis client error` lines stop; realtime cross-replica delivery resumes
  (send a test notification and watch two replicas' logs, or check the fan-out metric).
- Rate-limit and unread-count behavior back to shared instead of per-replica.

## Escalate when

- Redis is up but data looks wrong (eviction policy wiped persistent keys — needs keyspace audit).
- Degraded-mode symptoms persist 30 minutes after Redis recovery (stuck client state — restart API replicas).

## After

- [ ] Postmortem linked here.
- [ ] If anything assumed Redis was always present, file the resilience bug — degraded mode is a contract, test it.
