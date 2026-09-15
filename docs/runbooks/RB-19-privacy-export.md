# RB-19: Privacy export backlog or failures

- **Severity:** SEV-2; SEV-1 when a legal response deadline is at risk
- **Owner:** privacy operations and backend on-call
- **Last reviewed:** 2026-09-15

## How you notice

`PrivacyExportBacklog` means more than 100 exports are pending or the oldest has waited over 15
minutes. `PrivacyExportFailures` means at least one request exhausted its retries.

## Blast radius

Users cannot obtain a current data export. Normal application writes remain available, but statutory
response deadlines and support commitments may be affected.

## Triage in 5 minutes

1. Check `privacy_export_pending_depth`, `privacy_export_failed_depth`, and
   `privacy_export_oldest_pending_age_seconds`.
2. Search worker logs by DSR request ID and contributor name; payloads must remain redacted.
3. Confirm worker heartbeat, database readiness, and storage availability.
4. Check whether `admission.stop.privacy-exports` was deliberately enabled during an incident.

## Fix paths

1. Restore the failed dependency and let stale `PROCESSING` claims recover automatically.
2. Fix a failing lifecycle contributor, then retry the original request without creating duplicates.
3. Keep the admission stop flag enabled only while accepting new work would increase the incident.

## Verify

Pending age decreases, failed depth is understood or cleared through the approved retry path, and a
canary request reaches `READY` or explicitly documented `PARTIAL` status.

## Escalate when

The oldest request continues aging for 30 minutes, a contributor produces malformed data, or any
request approaches the organization's legal response deadline.

## After

- [ ] Link the incident and privacy review.
- [ ] Record contributor, capacity, and deadline follow-ups.
