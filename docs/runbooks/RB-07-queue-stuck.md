# RB-07: Queue stuck / stalled BullMQ jobs

- **Severity:** SEV-2 (escalates if user-visible side effects stop — see RB-05)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Delayed side effects pile up (emails/notifications late) while the API itself is healthy
  and the outbox relay keeps publishing.
- Logs show `BullMQ worker error` lines, or jobs sit `active`/`delayed` far past their
  expected duration. Distinguish from RB-05 (relay not publishing) — here publishing works,
  consumption doesn't.

## Blast radius

Everything downstream of background jobs stalls: emails, digests, file post-processing.
Direct request/response traffic is unaffected, which is exactly why this hides — the app
"works" until someone asks where their email is.

## Triage in 5 minutes

1. Which queue? Job names carry the queue — group the `BullMQ worker error` lines by
   `queue` field before anything else.
2. Worker processes alive? Check the worker role (`PROCESS_ROLE=worker`) processes and
   their recent log lines — a deployed worker crash looks identical to a stuck queue.
3. Redis responsive? (`redis-cli ping`; queue state lives in Redis — see RB-03 if not.)
4. One failing job type or all? Single type = poison payload or broken handler (deploy
   correlation?); all types = worker fleet or Redis problem.

## Fix paths

1. **Worker fleet down:** restart the worker deployment; jobs resume from Redis state —
   BullMQ persists them, restarts don't lose queued work. Rollback: N/A.
2. **Poison job blocking concurrency:** let it exhaust to failed/dead-letter per policy,
   fix the handler, redeploy; do not flush the whole queue to "unblock" it.
3. **Stalled (active forever, no progress):** check for missing `await`s or hung external
   calls in the handler; stalled-job recovery re-queues per BullMQ lock TTL — verify the
   handler is idempotent first (job IDs are stable, so double-run is possible by design).

## Verify

- Queue depth falling, worker error lines stopped, delayed-job age back under a minute.
- End-to-end probe: trigger the affected job type and watch it complete.

## Escalate when

- Depth grows through a worker restart with healthy Redis (handler-level deadlock — code fix).
- Failed-job payloads suggest data corruption rather than code bugs.

## After

- [ ] Postmortem linked here.
- [ ] Poison-payload regression test; handler idempotency review if double-run caused harm.
