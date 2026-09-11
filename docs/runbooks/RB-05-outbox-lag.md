# RB-05: Outbox lag / depth growing

- **Severity:** SEV-2 (escalates to SEV-1 if still growing after 30 minutes — lag becomes loss)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- `OutboxPendingDepthHigh` (`outbox_pending_events_depth > 1000` for 10m) or
  `OutboxEventLagHigh` (`outbox_pending_age_ms > 300000` for 5m).
- Users report missing side effects: notifications never arrive, emails unsent, realtime
  silent — while direct reads/writes look fine (the write path works; the relay doesn't).

## Blast radius

Writes succeed, consequences don't: emails, notifications, realtime fan-out, and anything
downstream of domain events stalls. The longer the lag, the larger the catch-up burst —
which is itself a load risk on recovery.

## Triage in 5 minutes

1. Grafana: outbox depth and age graphs — still climbing (relay dead/slow) or flat-high
   (burst draining normally)?
2. Relay liveness: worker process running? Recent `outbox relay` log lines within the last
   minute? (`OutboxRetryRateHigh` firing too means failing, not idle.)
3. `OutboxDeadLettersCreated` firing as well? If yes, go to RB-07 (dead letters) after
   stabilizing — some events need replay via `OutboxService.replayDeadLetter`.
4. Database reachable and not locked? A stuck migration lock or `DB_IDLE_IN_TRANSACTION`
   pileup starves the relay's `SKIP LOCKED` reads — check `pg_stat_activity`.

## Fix paths

1. **Relay process dead:** restart the worker role; the relay resumes from pending rows
   (idempotent job IDs make redelivery safe). Rollback: N/A.
2. **Relay slow (depth climbing, no errors):** check DB pressure and downstream broker health
   (BullMQ/Redis — see RB-03); burst drains on its own once the bottleneck clears — do not
   restart repeatedly, restarts reset backoff and worsen bursts.
3. **Poison event looping:** retries climbing on one event ID — let it dead-letter, then
   replay after the code fix ships. Never delete the row to "clear" the alert.

## Verify

- Depth and age metrics falling back to baseline; dead-letter counter flat.
- End-to-end probe: trigger a test notification and watch it arrive (center + realtime).

## Escalate when

- Lag still growing 30 minutes after relay restart with healthy dependencies.
- Dead letters accumulating faster than replays clear them (consumer bug, not ops).

## After

- [ ] Postmortem linked here.
- [ ] If the cause was downstream (broker/DB), link that incident too — outbox lag is often a symptom.
