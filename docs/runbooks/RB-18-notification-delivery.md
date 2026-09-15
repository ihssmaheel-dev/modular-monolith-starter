# RB-18: Notification delivery backlog or dead letters

- **Severity:** SEV-2; SEV-1 when a required transactional channel is unavailable
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-15

## How you notice

`NotificationDeliveryBacklog` means more than 1,000 intents are pending or the oldest is over five
minutes old. `NotificationDeliveryDeadLetters` means an email or push intent exhausted five attempts.

## Blast radius

In-app records remain queryable. Email and push delivery can be delayed or permanently stopped for
the affected intents. A recovery burst can increase provider usage and cost.

## Triage in 5 minutes

1. Check `notification_delivery_pending_depth`, `notification_delivery_dead_depth`, and
   `notification_delivery_oldest_pending_age_seconds` in Prometheus.
2. Search worker logs for `NotificationDeliveryWorker`, the channel, intent ID, provider response,
   and database or Redis errors.
3. Check the configured email and push provider status and current quotas.
4. Confirm a current worker heartbeat and stable database latency before restarting anything.

## Fix paths

1. Restore the failed provider or credentials and allow scheduled retries to drain the backlog.
2. Scale the worker only after confirming provider and database capacity; watch outbound request rate.
3. Inspect dead intents and replay them with the same intent ID after fixing the cause. Do not create
   replacement notifications because that can duplicate delivery.

## Verify

Pending age and depth fall, dead depth stops increasing, and a canary notification reaches each
enabled channel exactly once.

## Escalate when

The oldest age still grows 15 minutes after dependency recovery, dead intents continue increasing,
or delivery is required for a regulated business process.

## After

- [ ] Link the incident review.
- [ ] Record provider quota, retry, and cost changes.
