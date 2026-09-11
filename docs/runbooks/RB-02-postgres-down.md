# RB-02: Postgres down / pool exhausted

- **Severity:** SEV-1 (down) / SEV-2 (pool pressure without outage — same triage, calmer voice)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- `/api/v1/health/ready` red while `/live` is green.
- Logs show `ECONNREFUSED`, `timeout`, or pool exhaustion (`DB_MAX_POOL_SIZE`, default 10).
- Users report errors on every data screen; static pages may still render.

## Blast radius

Total data-plane outage: API reads/writes, workers, migrations, seed. Realtime connections
stay socket-open but serve nothing new. Distinguish pool exhaustion (DB alive, app
starved) from DB down — the fixes are opposites.

## Triage in 5 minutes

1. `pg_isready -h <host> -U postgres` (or `docker compose exec postgres pg_isready -U postgres`).
   Healthy: `accepting connections`.
2. If accepting: check pool pressure —
   `SELECT count(*), state FROM pg_stat_activity GROUP BY state;`
   Healthy: total well under `DB_MAX_POOL_SIZE` × replica count. If saturated with `idle in
transaction`, suspect a stuck deploy or a long migration, not load.
3. `docker compose ps postgres` — `healthy` vs `restarting`/`exited`.
4. `docker compose logs --tail=50 postgres` — look for `FATAL`, `out of memory`, or disk errors
   (disk errors → RB-04 immediately).

## Fix paths

1. **Pool exhaustion, DB healthy:** raise `DB_MAX_POOL_SIZE` modestly (e.g. 10 → 20) and
   restart API replicas; then hunt the leak (new code holding transactions? missing `await`?).
   Rollback: revert the env value — pool size is config-only, zero schema risk.
2. **Postgres container down:** `docker compose up -d postgres`, wait for `healthy`, then
   restart API so pools reconnect. Rollback: N/A.
3. **Managed Postgres (prod) unreachable:** check provider status page first, then security
   groups / TLS mode (`sslmode=require` family) before touching the app. Rollback: N/A.

## Verify

- `pg_isready` accepting; `ready` probe green; `pg_stat_activity` back to baseline counts.
- Login + one paginated list load succeed; worker lag metrics recovering.

## Escalate when

- Data directory corruption suspected (never attempt DIY recovery — restore path only).
- Pressure returns within an hour of raising the pool (leak, not load — needs code fix).

## After

- [ ] Postmortem linked here.
- [ ] If pool pressure was the cause, file the connection-leak investigation (or the limit increase, with numbers).
