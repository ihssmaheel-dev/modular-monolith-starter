# RB-12: Deploy migration failure

- **Severity:** SEV-1 (deploy blocked; if a partial migration ran, data is at stake)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Deploy pipeline stops at the `migrate` service (`completed_successfully` gate never
  fires), so api/worker never start — or the migrate container exits non-zero in logs.
- Never "just rerun and hope": a failed migration means the journal position and the
  database disagree, and blind retries can run half a migration twice.

## Blast radius

Deploy frozen on the old version (previous containers keep serving if untouched).
Risk concentrates in one place: partial migrations. Reads/writes on the old code
against a half-migrated schema are the actual danger, not the failed deploy itself.

## Triage in 5 minutes

1. `docker compose logs migrate` (environment's compose file) — the failing statement
   and journal position are in the first error, not the last retry.
2. `pnpm --filter api db:migrate:status` (or `db:migrate:check`) against the target
   database — which migrations applied, which is pending, is the journal ahead or behind?
3. Was it a timeout/lock (`DB_LOCK_TIMEOUT_MS`, concurrent deploy racing the journal
   lock) or a real SQL error (bad DDL, violated constraint)? Locks retry safely; SQL
   errors do not.
4. Expand/contract check: does the failed migration drop/rename anything live code still
   reads? (Policy: never — if it does, the migration, not the deploy, is the bug.)

## Fix paths

1. **Lock/timeout flake:** confirm no partial application (journal position unchanged),
   then re-run migrate once. Rollback: N/A.
2. **Bad migration, nothing applied:** fix the migration SQL, regenerate the journal entry
   properly (`db:generate` flow, never hand-edit applied entries), redeploy. Rollback: N/A.
3. **Partial application:** restore from pre-deploy backup to a scratch database, verify,
   then decide forward-fix vs restore with a decision-maker — never hand-edit the schema
   to "match" the journal. Rollback: the backup, tested via the restore-verify script.

## Verify

- `db:migrate:status` shows the journal fully applied; `migrate` service exits 0;
  api/worker pass health checks; one smoke login + write.
- The exact failing statement from triage now succeeds — not "a deploy went green".

## Escalate when

- Any partial application is confirmed (data-integrity call, not an ops call).
- The journal and the database disagree and neither forward-fix nor backup path is clean.

## After

- [ ] Postmortem linked here.
- [ ] `db:migrate:check` in CI must have caught this class — if it didn't, fix the check.
