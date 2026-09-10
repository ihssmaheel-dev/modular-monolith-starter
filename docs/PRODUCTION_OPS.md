# Production operations

How this monolith ships and survives production: delivery, TLS, secrets, workers, migrations,
alerting, backups, and load shedding. Architecture rationale lives in `PRODUCTION_ARCHITECTURE.md`;
this file is the operator runbook.

## Continuous delivery (`.github/workflows/cd.yml`)

On every push to `main` (or manual dispatch):

1. Build API + web images, tag with the short SHA plus `latest`, push to GHCR.
2. Scan both images with Trivy (`HIGH,CRITICAL` fails the run).
3. Validate `docker/docker-compose.prod.yml` config with placeholder prod values.

Deploy on your host with the published tag:

```bash
TAG=<sha> docker compose -f docker/docker-compose.prod.yml up -d --wait
```

Migrations run first via the `migrate` service (`service_completed_successfully` gate), so API
and worker never start against an unmigrated database. Verify with `GET /api/v1/health/live`
and `GET /` afterwards. Roll back by re-running with the previous `TAG`.

## TLS (`docker/nginx.conf`, `docker/ssl/`)

- Port `80` always serves plain HTTP (LB-terminated TLS or local smoke tests).
- Port `443` serves HTTPS with strong ciphers and HSTS when `docker/ssl/cert.pem` +
  `docker/ssl/key.pem` are mounted (`./ssl:/etc/nginx/ssl:ro` in prod compose).
- `docker/nginx-entrypoint.sh` strips the 443 block at startup when certs are absent, so the
  same compose file works with and without certificates. Never commit real certs; provide them
  via your host, Vault, or ACME sidecar writing into `docker/ssl/`.

## Secrets

Prefer file-mounted secrets over inline env in production: set `<NAME>_FILE` to a secret path
(Docker secrets, Vault Agent, AWS SM mounts). Supported: `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_SIGNING_KEYS`, `JWT_REFRESH_SIGNING_KEYS`,
`METRICS_TOKEN`, `ERROR_REPORTING_TOKEN`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`SMTP_USER`, `SMTP_PASS`, `RESEND_API_KEY`, `SEED_ADMIN_PASSWORD`. File content wins and faces
the same Zod validation. See `docs/ENVIRONMENT.md` and `docker/.env.prod.example`.

## Error reporting

The API always emits structured error logs. Set `ERROR_REPORTING_URL` to optionally forward only
unhandled server errors to any HTTP JSON collector; `ERROR_REPORTING_TOKEN` adds a bearer token.
The payload has a documented `schemaVersion`, sanitized request context, request ID, and optional
trace/user/tenant IDs, but never includes request headers or bodies. Delivery is asynchronous,
bounded by a short timeout, and protected by a circuit breaker so an unavailable collector cannot
impact API requests. Keep logs as the baseline signal and adapt the neutral payload at the
collector boundary for the chosen observability provider.

### Error reference IDs and trace correlation

When errors occur on the API or in the frontend, an 8-character error reference (e.g. `ref #a3f9c1e4`) is generated and displayed on user-facing error boundaries:

- **Trace correlation**: On API failures with an active OpenTelemetry span, the reference is derived from the first 8 hex characters of the `trace_id`.
- **Loki lookup**: Search Loki for `{application="api-service"} |= "a3f9c1e4"` to immediately locate the exact structured error log and stack trace.
- **Jaeger link**: In Grafana Loki, the derived `TraceID` field links directly into Jaeger (`http://localhost:16686/trace/<traceId>`) to inspect the full distributed trace.
- **Support copy**: Users or testers can click "Copy error details" on any error boundary (`RouteErrorFallback` or `RootError`) to copy a structured text payload containing the reference, trace ID, request ID, and timestamp.

## Workers and migrations

- Prod compose runs three API-image roles: `api` (`PROCESS_ROLE=api`), `worker`
  (`PROCESS_ROLE=worker`, outbox relay + queue consumers), and one-shot `migrate`.
- The worker has no HTTP port; its healthcheck asserts the Node process is alive. Do not
  disable it — a silent worker stalls the outbox.
- Migrations use the compiled output: `node apps/api/dist/apps/api/src/infrastructure/database/migrate.js`
  (`pnpm --filter api db:migrate:prod`). Never run `tsx`/dev tooling in production images.
- Web starts without pnpm: `node /app/node_modules/srvx/dist/cli.mjs --prod` from
  `/app/apps/web` (see `apps/web/Dockerfile`).

## Alerting (`docker/observability/prometheus/`)

- `alerts.yml` covers outbox lag/dead-letter/retry and file reconciliation; `prometheus.yml`
  has a commented `alerting:` block pointing at `alertmanager:9093`.
- To page on-call: copy `alertmanager.example.yml` to `alertmanager.yml`, set
  `SLACK_WEBHOOK_URL`, run Alertmanager alongside Prometheus, and uncomment the block.
  Local `observability:up` intentionally runs without Alertmanager.

## Backups (`scripts/db-backup.sh`, `scripts/db-restore.sh`, `scripts/db-restore-verify.sh`)

```bash
DATABASE_URL=... pnpm db:backup [./backups]     # pg_dump → gzip → verify → retain
DATABASE_URL=... pnpm db:restore ./backups/pg_backup_<ts>.sql.gz
RESTORE_VERIFY_DATABASE_URL=... RESTORE_VERIFY_ALLOW_RESET=true \
  pnpm db:restore:verify ./backups/pg_backup_<ts>.sql.gz
```

Every backup is integrity-checked (`gzip -t`, non-empty) and retention keeps the newest
`BACKUP_RETENTION_COUNT` archives (default 7). Backup artifacts are git-ignored. Schedule
`db:backup` from cron/systemd on the database host. Run `db:restore:verify` against a disposable
database whose name contains `restore`, `scratch`, or `test`; the command refuses other names,
requires the explicit reset flag, restores in one transaction, and verifies that tables are
queryable. The CI pipeline exercises this flow on every change, so a backup format or restore
regression is caught before release.

## Load shedding (`apps/api/src/main.ts`)

`@fastify/under-pressure` sheds traffic with `503 + Retry-After: 30` when the event loop
exceeds 1000ms delay or 0.98 utilization (container-size-independent signals; no heap/RSS
byte thresholds by design). Probes and docs (`/api/v1/health`, `/metrics`, `/api/docs`, `/docs`)
bypass shedding so the orchestrator never restarts a merely busy process. Shed events log a
Pino warning with `pressureType`. Tune thresholds from Grafana event-loop panels under real
traffic; the 503 envelope is `{ statusCode: 503, message, error: "UNDER_PRESSURE" }`.
