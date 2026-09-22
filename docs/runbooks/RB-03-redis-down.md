# RB-03: Redis down (degraded mode, not full outage)

This runbook also covers `RedisMemoryPressure` and `RedisEvictionsDetected`.

- **Severity:** SEV-2 (degraded by design — read the blast radius before panicking)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Alert `RedisKeyspaceHitRatioLow` firing (cache hit ratio < 40% over 15m).
- Logs show `Redis client error` / `Failed to connect to Redis`.
- In **production** (`NODE_ENV=production`), `/health/ready` probe **fails (503 Service Unavailable)** because `RedisHealthIndicator` reports `session.down()`. In local/test environments, readiness reports `up` (unconfigured).
- Liveness `/health/live` stays 200 (it intentionally runs without database/Redis dependencies).

## Blast radius

- **Readiness probe in production:** Pods/containers fail readiness and ingress load balancers will stop routing traffic or mark replicas degraded.
- **Rate limiting behavior:**
  - **Authentication & sensitive routes** (`/auth/`, `auth:`, `failClosed: true`): **Fail closed** (`allowed: false`). Login and token endpoints reject requests to protect against brute-force attacks during an outage.
  - **General API routes:** **Fail open** (`allowed: true`) to preserve availability. There is no local in-memory sliding-window fallback across replicas.
- **Other degraded subsystems:** Realtime WebSocket cross-replica fan-out stops (isolated to local process); refresh-token reuse detection in Redis falls back to account `authVersion` checks; distributed worker locking falls back to PostgreSQL advisory locks (requiring direct connections); unread count cache bypasses to database queries.

## Triage in 5 minutes

1. `redis-cli -h <host> -p <port> ping` (or `docker compose exec redis redis-cli ping`).
   Healthy: `PONG`.
2. `docker compose ps redis` — `healthy` vs `restarting`/`exited`.
3. `docker compose logs --tail=30 redis` — OOM killer lines mean memory, not network (→ RB-04
   if the volume/host is full, else check `maxmemory` policy for the environment).
4. Confirm health status: `/health/live` should be 200; `/health/ready` will be 503 in production until Redis responds.

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
