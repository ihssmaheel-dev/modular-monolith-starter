# RB-04: Disk full (postgres / minio / logs)

- **Severity:** SEV-1 if the database volume is full; SEV-2 for object storage or logs
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Postgres logs `could not extend file` / `No space left on device`; uploads fail;
  Loki/Promtail stop shipping; containers may fail to start (no space for layers).
- Users report write failures while reads still work — the classic full-disk signature
  (reads need no new pages; writes do).

## Blast radius

Depends entirely on _which_ disk: database volume full halts all writes (reads survive
briefly); MinIO full breaks uploads and avatars only; log volume full blinds observability
first and crashes shippers second. Identify the volume before acting.

## Triage in 5 minutes

1. `df -h` on the host (and `docker system df -v` for Docker disk usage). Healthy: every
   mounted volume under 80%.
2. Name the fullest volume: `postgres_data`, `minio_data`, or log paths (Loki chunks,
   container json logs). `du -sh <path>/* | sort -rh | head` for the culprit directory.
3. If Postgres: `SELECT pg_size_pretty(pg_database_size(current_database()));` for scale,
   and check for runaway audit/outbox retention (see retention workers).

## Fix paths

1. **Logs first (safest space):** rotate/truncate shipper buffers and container logs
   (`docker compose logs` output is not precious — Loki has it, or it was never shipped).
   Rollback: N/A — logs are expendable by design.
2. **Expired data via retention workers:** confirm the audit/outbox/file retention jobs are
   running (their metrics flatlined? the worker may be dead — see RB-09 pattern). Trigger a
   manual run if safe. Rollback: N/A — retention deletes only expired rows.
3. **Grow the volume** (cloud) or prune unused Docker artifacts (`docker system prune`
   after checking nothing needed is dangling). Rollback: N/A.
4. **Database volume, nothing prunable:** stop writes gracefully, extend storage, restart.
   Never delete database files by hand.

## Verify

- `df -h` back under 80% on all volumes; writes succeed (create a test note/upload);
  log shipping resumes (fresh Loki entries appear).

## Escalate when

- The database volume is full and nothing is safely prunable (storage extension + possible
  downtime call — needs a decision-maker, not heroics).
- Growth resumes within 24h (something is leaking — file a bug with the growth numbers).

## After

- [ ] Postmortem linked here.
- [ ] Add/adjust the disk-usage alert threshold that should have fired earlier.
- [ ] If retention workers were dead, fix the worker supervision gap, not just the disk.
