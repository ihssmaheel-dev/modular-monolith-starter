# RB-01: API down / health failing

- **Severity:** SEV-1
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- `GET /api/v1/health/live` stops returning 200, or `/api/v1/health/ready` degrades.
- Users report "app won't load" across web and mobile simultaneously.
- Distinguish first: **live failing = process dead**; **live OK but ready failing = dependencies
  (Postgres/Redis) unreachable** — that sends you to RB-02/RB-03, not here.

## Blast radius

Everything behind the API: web, mobile, workers consuming jobs. CDN/static assets (if any)
are unaffected. If only `ready` fails, already-established websocket/SSE streams may
briefly survive while new requests fail.

## Triage in 5 minutes

1. `curl -m 5 http://localhost:3000/api/v1/health/live` (prod host/port per environment).
   Healthy: `200` with `{"status":"ok"}`-shaped body.
2. `curl -m 5 http://localhost:3000/api/v1/health/live` vs `/api/v1/health/ready` — record which fails.
3. `docker compose ps` (with the environment's compose file). Healthy: `api` shows
   `healthy`, not `restarting` or `exited`.
4. `docker compose logs --tail=100 api | grep -i -E "error|exception|fatal"` — look for the
   first error, not the last; cascades lie, roots don't.
5. If the process is up but slow, skip to RB-15 (latency) instead of restarting blindly.

## Fix paths

1. **Single crashed container** (exit code visible in `ps`): `docker compose up -d api`.
   Rollback: N/A — restart is idempotent; migrations already applied stay applied.
2. **Crash-looping on boot**: read the first log line; if it names a migration or env
   validation error, fix config (see RB-13 for migration failures), then restart.
   Rollback: previous image tag via registry (`ghcr.io/<repo>-api:<previous-sha>`).
3. **All replicas down, no clear error**: check the host (disk/memory) → RB-04/RB-16 —
   do not keep restarting into a full disk.

## Verify

- `curl /api/v1/health/live` → 200, then `/api/v1/health/ready` → 200.
- Error rate in logs drops to baseline; Grafana API dashboard 5xx flat.
- One real login + one list load in the app (staging first if prod is still suspect).

## Escalate when

- Ready stays red 15 minutes after a clean restart with healthy dependencies.
- The failure follows a deploy and rollback does not clear it (possible migration damage).

## After

- [ ] Postmortem linked here.
- [ ] If a new failure signature appeared, add/adjust the alert that should have fired.
