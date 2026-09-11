# RB-06: Dead letters appearing

- **Severity:** SEV-2 (single poison event) → SEV-1 (steady accumulation — the consumer is broken, not the event)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- `OutboxDeadLettersCreated` (`increase(outbox_dead_letter_total[10m]) > 0`) for the
  outbox path, or `realtime_dead_letter_total` climbing for the realtime stream path.
- One bad event is routine noise; a rising count means a consumer rejects a whole class.

## Blast radius

Outbox dead letters: the affected domain events never reach email/notification/realtime
consumers — silent feature loss, writes themselves look fine. Realtime dead letters:
only malformed or unroutable stream messages land here; connected clients simply never
see those events. Neither path retries on its own — dead letter is the end of the line
until replayed.

## Triage in 5 minutes

1. Which counter is moving — `outbox_dead_letter_total` (domain events) or
   `realtime_dead_letter_total` (stream messages)? Different stores, different replays.
2. Outbox: read the dead-letter row (source ID, payload, attempt history). One distinct
   payload repeating = poison event; many distinct payloads at once = consumer deploy broke
   parsing for everything.
3. Realtime stream: inspect `realtime:events:dead-letter` latest entries — malformed
   (missing `target`/`event`) vs valid-but-unroutable tells you producer bug vs router gap.
4. Check whether the producing code path changed in the last deploy before touching anything.

## Fix paths

1. **Poison event, consumer healthy:** fix the producer/consumer code, ship, then replay —
   `OutboxService.replayDeadLetter(id)` for outbox rows. Rollback: the replay itself is
   idempotent (outbox ID as job key), safe to retry.
2. **Consumer broken by deploy:** roll the consumer back first (registry tag), then replay
   the accumulated dead letters. Rollback: forward-fix only after replay drains.
3. **Malformed realtime message:** fix the publisher; dead-lettered stream entries do not
   auto-replay — confirm the fixed publisher emits fresh events instead.
4. Never delete dead-letter rows/streams to "clear" the alert — that destroys the evidence
   and the recovery path together.

## Verify

- Dead-letter counters flat for 15 minutes; replayed outbox IDs show `PUBLISHED`.
- End-to-end probe of the affected feature (e.g. test notification arrives).

## Escalate when

- Accumulation outpaces replays (consumer fundamentally broken — needs a code fix, not ops).
- Dead letters contain PII-sensitive payloads mishandled anywhere in the chain.

## After

- [ ] Postmortem linked here.
- [ ] Regression test for the poison shape that slipped through validation.
