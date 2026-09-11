# RB-14: p95 latency blowout

- **Severity:** SEV-2 (SEV-1 if checkout-critical paths breach user patience — judge by journey, not graph)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- p95/p99 latency alerts or "the app feels slow" reports with no errors — slowness without
  failure is a different animal from RB-13; don't mix the playbooks.
- First split: database slow, downstream slow, or app slow? The answer picks the fix.

## Blast radius

Degraded experience, not outage — but sustained high latency cascades: timeouts fire,
retries multiply load, pools saturate (→ RB-02), users retry manually (more load).
Treat slowness as pre-outage.

## Triage in 5 minutes

1. Which endpoints? Top the slow-query log — queries over 100ms are logged with their SQL
   snippet (`Slow database query detected`). One bad query beats ten theories.
2. `DB_STATEMENT_TIMEOUT_MS` killing queries (default 30000)? Timeouts masquerading as
   slowness means the database, not the app.
3. `pg_stat_activity`: lock waits (`wait_event_type = 'Lock'`) vs genuine slow execution.
   Locks point at migrations/transactions; slow execution points at plans/indexes.
4. Downstream: external calls (SMTP, S3, AV scanner) with new latency? Check their spans
   in a sampled Jaeger trace before blaming the database.

## Fix paths

1. **Missing/wrong index:** `EXPLAIN ANALYZE` the logged query, add the index in a
   migration, deploy. Rollback: drop index (concurrent builds preferred in prod).
2. **Lock contention:** find the holder (migration? long transaction? idle-in-transaction
   pileup), resolve that — never `pg_terminate_backend` blindly on a primary.
3. **Downstream slowness:** timeouts + fallbacks per the degraded-mode contract; escalate
   to the provider with trace IDs, not vibes.
4. **Traffic growth:** pool and replica review (RB-02 knobs) — scale the bottleneck the
   metrics name, not the whole stack.

## Verify

- p95 back under SLO for 15 sustained minutes (not one good minute).
- Slow-query log quiet for the offending query shape; pool stats normal.

## Escalate when

- The slow path is a migration or DDL holding production locks (freeze, decide, then act).
- Latency cause unidentified after 30 minutes (bring a DBA-shaped brain, not more restarts).

## After

- [ ] Postmortem linked here.
- [ ] The missing index/test/guard that would have caught this class pre-deploy.
