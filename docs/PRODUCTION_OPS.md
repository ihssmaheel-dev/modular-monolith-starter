# Production operations

This is the provider-neutral production contract for the starter. Docker Compose is a reference
single-host topology and a configuration smoke test. A real cloud deployment must translate the same
process roles, health probes, immutable images, secrets, limits, and release order into its
orchestrator.

## Release pipeline

`.github/workflows/ci.yml` runs architecture rules, formatting, lint, builds, unit/integration/E2E
tests, migration lineage and upgrade checks, a real backup/restore check, dependency audit, bundle
budgets, Compose validation, image builds, Storybook, and a generated feature typecheck. Third-party
actions are pinned to commits.

`.github/workflows/cd.yml` runs after a successful CI workflow on `main`, or by manual dispatch. It:

1. checks out the exact successful commit;
2. builds API and web images with a 12-character commit tag;
3. pushes and scans those immutable tags with Trivy;
4. validates normal, pooling, and staging Compose profiles using the resulting digests; and
5. uploads `release-manifest.json` containing the full commit and both registry digests.

Production Compose requires complete `API_IMAGE_REF` and `WEB_IMAGE_REF` digest references, so a
mutable tag cannot accidentally select a different artifact. The example CD workflow deliberately
does not mutate a cloud account. The deployment adapter for ECS,
Kubernetes, Nomad, or another platform must deploy the `image@sha256:...` values from the manifest,
and retain the manifest with release evidence.

Release order:

1. Back up and verify the current database according to the product RPO.
2. Run the migration image once using `DB_DIRECT_URL` and a restricted migration role.
3. Deploy worker and API images by digest with readiness gates and graceful draining.
4. Deploy the web image by digest.
5. Verify `/health/live`, `/health/ready`, worker `/health/ready`, and a product canary.
6. Monitor errors, latency, queues, outbox, database connections, and spend during the rollout.

Schema changes must follow expand/contract so the previous application digest remains usable during
rollback. A rollback is incomplete if only the application image is reverted while its schema is no
longer backward compatible.

## Process topology and scaling

Run separate instances of the same API image:

- `PROCESS_ROLE=api` serves HTTP, oRPC, SSE, and WebSocket traffic.
- `PROCESS_ROLE=worker` runs scheduled work and consumers, and exposes metrics and health on
  `WORKER_METRICS_PORT` (default `9464`).
- `migrate` is a one-shot process and never uses PgBouncer transaction pooling.

Budget PostgreSQL connections across the whole fleet:

```text
required connections = (API replicas + worker replicas) × DB_MAX_POOL_SIZE
                     + migrations + exporters + operator reserve
```

The optional Compose `pooling` profile demonstrates PgBouncer. Cloud-managed proxies are valid when
they preserve the transaction semantics and prepared-statement behavior used by the application.
Scale workers only after checking database, Redis, storage, and provider quotas; extra replicas can
turn a backlog into an expensive retry burst.

The worker health endpoint checks PostgreSQL and Redis. `worker_process_up`, heartbeat timestamp,
queue, notification-delivery, privacy-export, and outbox metrics distinguish a live process from one
that is making progress. The worker container healthcheck uses `/health/ready`.

## Ingress, TLS, and proxy trust

The default and recommended browser topology is one public origin: NGINX serves web traffic and
proxies `/api/` and `/ws`. Cookies remain host-only in this topology. A sibling-subdomain topology is
an explicit opt-in: set `COOKIE_DOMAIN` to the validated common DNS parent, configure both HTTPS
origins in `CLIENT_URL`/`API_URL`, and treat every sibling allowed to receive that cookie as trusted.
Never use a public suffix or a parent shared with untrusted applications. Mobile and service clients
use bearer tokens.

The SSR web response owns the document Content Security Policy. It creates a fresh cryptographic
nonce before router initialization and applies the same nonce to the policy and framework scripts.
NGINX forwards that policy and does not add a second document CSP. Authenticated HTML is `no-store`;
immutable assets keep long-lived caching.

Two explicit ingress modes exist:

- With `docker/ssl/cert.pem` and `key.pem`, NGINX serves TLS on 443, sends HSTS, and redirects port 80
  to HTTPS except for the ACME challenge path.
- Behind a trusted cloud TLS terminator, set `ALLOW_INSECURE_HTTP=true`. The entrypoint then selects
  `nginx-insecure.conf`, which treats the upstream connection as HTTPS. Restrict container port 80 to
  the load balancer security group/network; never expose it directly.

NGINX replaces incoming forwarding headers with the immediate peer address. The application enables
proxy trust only in the production Compose topology. A cloud adapter must constrain trusted hops and
must not pass an unsanitized client `X-Forwarded-For` chain.

The reference NGINX upstream has passive failure handling. Open-source NGINX does not perform active
readiness discovery for a single static upstream. A multi-instance cloud deployment must register
only ready tasks/pods/instances with its load balancer and drain them before termination. Compose
startup health dependencies do not provide zero-downtime rolling deployment by themselves.

## Secrets and cloud identity

Prefer workload identity for cloud APIs. When S3 endpoint and static credentials are absent, the AWS
SDK uses its default credential chain. Static S3 keys are intended for local or non-AWS S3-compatible
providers. Grant only required bucket/key actions and block all public access.
The repository's pinned MinIO container is an archived local/staging test fixture and is excluded
from the production Compose topology. Do not promote it into a production deployment.

For secrets without a workload-identity equivalent, use a platform secret mount and set
`<NAME>_FILE`. Supported values include database/Redis URLs, JWT keys, metrics/error-reporting tokens,
S3 credentials, SMTP/Resend credentials, Expo access token, and seed password. File content takes
precedence and passes the same Zod validation. Do not place production values in Compose files,
workflow variables, image layers, or Vite public variables.

Rotate signing keys through `JWT_SIGNING_KEYS`/`JWT_REFRESH_SIGNING_KEYS`: add a new key, change the
active key ID, wait through token expiry, then remove the old key. Keep access and refresh keys
separate.

## Storage and spend controls

The file module enforces declared size, per-user bytes, per-tenant bytes/object quotas, IP/actor/tenant
rate limits, quarantined upload keys, signed content length/type, immutable version/digest promotion,
virus scanning hooks, and bounded reconciliation/cleanup. `admission.stop.file-uploads` stops new
reservations during abuse or a cost incident.

Repository code cannot configure cloud billing. Before enabling files:

1. Apply `docker/storage-lifecycle.example.json` or an equivalent policy to abort multipart uploads,
   expire quarantine objects, and bound noncurrent versions.
2. Configure bucket request/byte/egress alerts and organization/account budgets in the cloud provider.
3. Decide whether downloads need CDN signed URLs, per-download authorization, shorter TTLs, or an
   application proxy for strict egress accounting.
4. Cap CDN origin egress and cache retention according to product data sensitivity.
5. Run the orphan reconciliation and lifecycle-deletion canary.

Presigned URLs remain reusable until expiry. Strict one-download semantics or byte-perfect egress
budgets require a project-specific delivery policy; the generic file module does not claim those.

Also configure budgets/alarms for database storage and I/O, Redis memory/commands, NAT/data transfer,
logs/traces/metrics ingestion and retention, email/SMS/push providers, queue operations, and container
CPU/memory. Container limits and bounded batches prevent one process from consuming unlimited host
resources; cloud budgets and admission flags limit account-level financial exposure.

## Observability and incident response

Production logs always go to structured stdout. `LOKI_HOST` adds direct Loki delivery, but the
preferred cloud pattern is a node/task log collector. Pino redacts credentials and tokens centrally.
Request IDs and OpenTelemetry trace/span IDs correlate API, error, and audit signals.

Prometheus scrapes API and worker metrics in the production observability overlay. Alert rules cover
availability, errors, latency, outbox/queue health, notification delivery, privacy export, worker
liveness, files, dependencies, and container pressure. Every alert maps to one file in
`docs/runbooks/`; `pnpm rules:check` enforces the mapping.

The bundled production observability overlay is optional. Managed Prometheus, logs, tracing, and
error reporting are valid if the same signals, retention, access control, and alerts exist. Do not
expose metrics or Grafana publicly. Metrics endpoints require `METRICS_TOKEN` in production.

The bundled production overlay is private by default: its observability services have no host
published ports. Supply the following deployment-time values when enabling it with
`--profile observability`; Compose intentionally fails closed when any required value is absent:

- `OTEL_EXPORTER_OTLP_ENDPOINT` — the authenticated HTTPS OTLP/HTTP trace endpoint.
- `METRICS_TOKEN_FILE` — a host secret file mounted read-only into Prometheus.
- `ALERTMANAGER_CONFIG_FILE` — a rendered Alertmanager config based on
  `docker/observability/alertmanager/alertmanager.prod.example.yml`.
- `ALERTMANAGER_SMTP_PASSWORD_FILE` — the SMTP password file mounted read-only.
- `GF_SECURITY_ADMIN_PASSWORD` — a unique secret for the private Grafana deployment.
- `OBSERVABILITY_POSTGRES_EXPORTER_DSN` and `OBSERVABILITY_REDIS_EXPORTER_URL` — TLS-enabled,
  least-privilege exporter connections.

Prometheus retention is bounded to 15 days/10 GB. Loki retains seven days and enforces ingestion,
burst, and per-stream limits. Prometheus uses bounded samples per scrape and a 15-second application /
30-second infrastructure cadence to control collector work. Keep the
overlay on a private network or behind an authenticated operator gateway, and use cloud budgets,
log/trace retention policies, and managed-service quotas for account-level cost control. The CI
workflow renders this exact merge, validates dashboards, and runs `promtool` against the production
Prometheus configuration and alert rules.

cAdvisor is deliberately not enabled by the default production observability profile because it
requires privileged host mounts and a Docker socket. On a dedicated single-host deployment where
that trade-off is accepted, add `--profile observability-host` and use an explicit host firewall;
cloud deployments should use the provider's container and host metrics instead.

`@fastify/under-pressure` returns the common localized error envelope with a request ID and
`Retry-After` when event-loop delay/utilization crosses the configured limits. Health and metrics
remain reachable so an orchestrator can distinguish overload from process death.

## Backups and recovery

```bash
DATABASE_URL=... pnpm db:backup [./backups]
DATABASE_URL=... pnpm db:restore ./backups/pg_backup_<timestamp>.sql.gz
RESTORE_VERIFY_DATABASE_URL=... RESTORE_VERIFY_ALLOW_RESET=true \
  pnpm db:restore:verify ./backups/pg_backup_<timestamp>.sql.gz
```

Backups are gzip-tested and retained locally according to `BACKUP_RETENTION_COUNT`. Restore refuses a
non-disposable verification database, restores transactionally, applies matching forward migrations,
and verifies required tables, migration journal, forced RLS/policy counts, and audit immutability.
CI runs this database exercise.

Production recovery additionally requires encrypted off-site backups, point-in-time recovery where
the RPO requires it, a matching release manifest, object-storage version/backup policy, queue/outbox
reconciliation, and a timed restore drill. The repository cannot prove RPO/RTO until that drill runs
in the chosen cloud environment.

## Required pre-traffic evidence

- CI is green for the exact release commit and the digest manifest is retained.
- Fresh and upgrade migrations pass against the production PostgreSQL major version.
- API and worker readiness pass with production-like network policy and credentials.
- Restore drill, object lifecycle, audit immutability, and tenant-isolation probes pass.
- Load tests establish replica, pool, queue, and rate-limit settings.
- Cloud budgets, anomaly detection, retention, and kill-switch access are configured and tested.
- Dashboards and paging routes reach the responsible on-call engineer.
