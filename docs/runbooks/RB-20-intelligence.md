# RB-20 — Optional intelligence service

This runbook covers the optional `apps/intelligence` service and the alerts
`IntelligenceServiceDown`, `IntelligenceProviderFailureRateHigh`, `IntelligenceProviderCircuitOpen`,
`IntelligenceQueueBacklogHigh`, and `IntelligenceConcurrencySaturated`.

## Triage

1. Confirm whether `INTELLIGENCE_ENABLED` is intentional for the deployment. If it is disabled,
   the service should not be running and intelligence routes should return a controlled disabled
   response.
2. Open the Grafana **Intelligence** dashboard. Check provider failures, p95 latency, active
   requests, queue age, and container CPU/memory together; do not increase concurrency before
   checking provider and database capacity.
3. Follow the trace from the Node queue worker to the private Python service and provider. Prompts,
   document contents, credentials, and tenant IDs must never be copied into an incident message.

## Provider failure or circuit open

Verify provider health, configured model names, network egress, and secret rotation. The circuit
is intentionally fail-closed. Allow the bounded reset window to elapse after the provider is
healthy; replay failed jobs only after confirming the provider is accepting requests. Do not remove
the circuit or increase retries during an incident.

## Queue backlog

Check worker replicas, Redis health, and the oldest job age. Scale the CPU-only Python service or
worker role within its documented resource budget. If the provider is degraded, pause producers or
apply the product's tenant budget policy instead of allowing an unbounded backlog. Failed jobs are
replayed through BullMQ's bounded retry policy and must be investigated before manual replay.

## Concurrency saturation

Inspect provider latency and container memory before changing `INTELLIGENCE_MAX_CONCURRENCY`.
Increase it only together with provider quota, Node bulkhead, CPU, and memory capacity. Record the
new limit and revert it after the incident if it was a temporary mitigation.

## Safe shutdown and recovery

Use the normal deployment drain so BullMQ workers stop accepting new work before termination. The
recovery worker re-enqueues durable `QUEUED` rows after restart. Verify the queue age and run/document
statuses after recovery; never delete rows to clear a backlog.
