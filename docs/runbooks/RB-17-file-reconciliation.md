# RB-17: File reconciliation errors / repairs

- **Severity:** SEV-2 (SEV-3 for repairs-only with no errors — the system healing itself visibly)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- `FileReconciliationErrors` (`increase(file_reconciliation_error_total[15m]) > 0`) or
  `FileReconciliationRepairs` (`increase(file_reconciliation_repaired_total[15m]) > 0`).
- Read them as a pair: repairs-without-errors is the janitor working; errors mean the
  janitor found something it couldn't fix — that half is yours.

## Blast radius

Tracked upload metadata versus storage reality drifting: missing bytes (broken downloads/avatars),
stale row state, or quota accounting skew. Bucket-wide untracked object discovery belongs to the
provider inventory/lifecycle process, not this row cursor. User-visible only
when downloads break or quotas look wrong — usually silent, which is why the alerts exist.

## Triage in 5 minutes

1. Errors or only repairs? Repairs-only → note it, watch one cycle, stand down unless
   the rate is new (a fresh spike after quiet months still deserves a look).
2. Error lines carry the file IDs and mismatch class — group by class before acting.
3. Correlate with deploys touching upload/attach/confirm paths and with storage changes
   (bucket recreation, credential rotation, CORS edits — see RB-09).
4. Check storage reachability independently — reconciliation errors during a storage
   outage are symptoms (RB-09), not a second incident.

## Fix paths

1. **Stale rows / skewed quotas:** let the repair job finish its cursor pass, then verify counts.
   For untracked bucket objects, use the configured quarantine lifecycle or a reviewed inventory job;
   do not issue broad manual deletes.
2. **Missing bytes (DB says file, storage says no):** restore from backup if the content
   matters; otherwise purge the dangling rows through the file cleanup path so quotas
   and listings stop lying.
3. **Post-deploy spike:** roll back the upload-path change first (registry tag), repairs
   drain after. Rollback: forward fix.

## Verify

- Both counters flat for two full reconciliation cycles; spot-check affected files
  download correctly and quotas read sane for sampled users.

## Escalate when

- Missing-bytes scope keeps growing (ongoing loss, not historical drift).
- Reconciliation itself errors (the janitor is broken — different bug, same pager).

## After

- [ ] Postmortem linked here.
- [ ] Upload-path regression test for the drift source; retention/confirm review if orphans recur.
