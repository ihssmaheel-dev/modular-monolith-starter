# RB-16: Realtime lag high / live updates stale

- **Severity:** SEV-2 (SEV-3 if only the 60s poll fallback covers it and nobody noticed)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Users report stale badges/feeds that fix themselves on manual refresh; the 60s unread
  poll masks it, so this is found by humans or by the consumer-lag metric, rarely by alarms.
- `realtime_consumer_lag_ms` climbing (event-generated → consumed delay) is the primary
  signal; per-instance dispatcher groups mean each replica reports its own lag.

## Blast radius

Freshness, not correctness: no data is lost (events persist in the stream, notifications
in the database). Clients converge on refresh/poll. Do not treat as data loss — treat as
delivery delay, or you'll "fix" it destructively.

## Triage in 5 minutes

1. Lag metric per replica — one replica lagging (its consumer wedged) vs all lagging
   (stream/Redis pressure or flood of events)?
2. Dispatcher groups healthy? Stale groups without heartbeats should have been reaped —
   a pile of dead groups points at reaper/heartbeat failure, not event volume.
3. Redis responsive? (RB-03 — streams live in Redis; slow Redis slows every consumer.)
4. Event flood or poison? A publisher emitting at extreme rate vs one malformed event
   pinning retries — check stream length growth rate vs error lines.

## Fix paths

1. **Wedged consumer on one replica:** restart that API replica; its group replays from
   `$` (live events only — no backlog storm by design). Rollback: N/A.
2. **Event flood:** find the publisher (deploy correlation?), calm it, let consumers drain.
   Do not trim the stream by hand while consumers read it.
3. **Redis pressure:** RB-03 first — realtime lag is often its symptom.
4. **Dead groups piling:** verify the reaper cron runs (5-minute cadence) and heartbeats
   flow (`realtime:dispatchers:heartbeat:*` keys with fresh TTLs); fix whichever leg died.

## Verify

- Consumer lag back under a few seconds on all replicas; live badge/feed updates observed
  in a real browser without manual refresh.
- Dead-group count back to ~replica count.

## Escalate when

- Lag persists with healthy consumers and Redis (routing/fan-out logic bug — code fix).
- Events confirmed lost (not delayed) — contradicts the design; treat as SEV-1 and dig.

## After

- [ ] Postmortem linked here.
- [ ] If detection was human, add the lag alert threshold that should have paged.
