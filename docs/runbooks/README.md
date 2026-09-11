# Runbooks

Procedures for incidents, read at 2 AM. Rules: every Prometheus alert maps to
exactly one runbook, every runbook maps to a real alert or a documented gap.
New runbook? Copy `TEMPLATE.md`, fill every section, add the row below.

## Available

| ID    | Runbook                                                    | Severity | Trigger                                        |
| ----- | ---------------------------------------------------------- | -------- | ---------------------------------------------- |
| RB-01 | [API down / health failing](RB-01-api-down.md)             | SEV-1    | `/health/live` vs `/ready`, user reports       |
| RB-02 | [Postgres down / pool exhausted](RB-02-postgres-down.md)   | SEV-1/2  | `ready` red, `pg_isready`, pool metrics        |
| RB-03 | [Redis down (degraded mode)](RB-03-redis-down.md)          | SEV-2    | `Redis client error`, partial symptoms         |
| RB-04 | [Disk full](RB-04-disk-full.md)                            | SEV-1/2  | write failures, `df -h`, log errors            |
| RB-05 | [Outbox lag / depth growing](RB-05-outbox-lag.md)          | SEV-2→1  | `OutboxPendingDepthHigh`, `OutboxEventLagHigh` |
| RB-06 | [Dead letters appearing](RB-06-dead-letters.md)            | SEV-2→1  | `OutboxDeadLettersCreated`, realtime DLQ       |
| RB-07 | [Queue stuck / stalled jobs](RB-07-queue-stuck.md)         | SEV-2    | worker errors, queue depth, delayed age        |
| RB-08 | [Worker silent death](RB-08-worker-silent-death.md)        | SEV-2    | missing `worker:heartbeat:*` keys              |
| RB-09 | [Uploads failing](RB-09-uploads-failing.md)                | SEV-2    | error keys, MinIO/S3, AV scanner               |
| RB-10 | [Emails not arriving](RB-10-emails-missing.md)             | SEV-2→1  | driver config, Mailpit, provider dashboard     |
| RB-11 | [TLS / certificate expiry](RB-11-tls-expiry.md)            | SEV-1/3  | browser warnings, `openssl` dates              |
| RB-12 | [Deploy migration failure](RB-12-migration-failure.md)     | SEV-1    | `migrate` gate, journal state                  |
| RB-13 | [5xx spike with error refs](RB-13-fivexx-spike.md)         | SEV-1/2  | error-ref flood → Loki → Jaeger                |
| RB-14 | [p95 latency blowout](RB-14-latency-blowout.md)            | SEV-2    | slow-query logs, timeout guards                |
| RB-15 | [OOM / container restarts](RB-15-oom-restarts.md)          | SEV-1/2  | heap errors, restart loops                     |
| RB-16 | [Realtime lag high](RB-16-realtime-lag.md)                 | SEV-2    | consumer lag metric, fan-out health            |
| RB-17 | [File reconciliation errors](RB-17-file-reconciliation.md) | SEV-2    | `FileReconciliationErrors/Repairs`             |

## Planned

_All planned runbooks are written — this table stays as the extension pattern for the next one._
