# Observability Re-audit — 2026-09-15

## Executive verdict

After the remediation described at the end of this report, the repository now provides a solid,
production-capable observability foundation. Structured logs, request/trace correlation,
OpenTelemetry, protected Prometheus endpoints, bounded telemetry services, health probes, alerting,
runbooks, and four focused Grafana dashboards are wired in real code and validated in a live stack.

The production Compose overlay keeps telemetry ports private, requires deployment credentials and
exporter endpoints, caps container resources and retained telemetry, limits Prometheus samples and
Loki ingestion, and uses configurable trace sampling. Alloy collects only workloads explicitly
labeled `observability.logs=true`; it bounds active streams and avoids collecting its own telemetry
failure logs. These controls substantially reduce the chance that observability can exhaust the
application host or create an uncontrolled ingestion bill.

**Current repository observability readiness: 8.6/10.** No known repository-controlled observability
defect remains that is expected to break or materially slow the application under the documented
defaults. Production deployment still requires private operator access, real alert recipients,
cloud budgets, and load-tested retention/capacity settings. Those are environment-specific release
evidence rather than values a reusable starter can safely hard-code.

## Scope and method

This audit inspected implementation rather than relying on documentation claims:

- API and worker logging, metrics, tracing, health, error reporting, client error capture, queue,
  outbox, realtime, files, notification, privacy, database, Redis, and rate-limit instrumentation.
- Prometheus scrape configuration and alert rules; Alertmanager routing; Loki, Alloy, Tempo, and
  Grafana provisioning.
- Every provisioned Grafana dashboard, panel title, variable, refresh interval, and PromQL/LogQL
  expression.
- Local, production, and production-observability Compose files after interpolation.
- README, production operations documentation, environment documentation, and all observability
  runbooks for code/documentation drift.
- CI checks relevant to architecture, configuration, alerts, and dashboards.

This was a repository audit. No deployed cloud account, VPC/firewall, managed telemetry platform,
real production traffic, alert receiver, or billing data was available. Therefore this report can
identify unsafe defaults and missing controls, but it cannot certify a deployed environment or prove
that an alert reaches an on-call engineer.

## Initial scorecard (before remediation)

The scores below preserve the state found by the audit. The current post-remediation assessment is
recorded in the remediation verification section so the original evidence and fixes remain
traceable.

| Area                    | Score | Evidence-based assessment                                                                                                                                                                                           |
| ----------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured logging      |  7/10 | JSON stdout in production, correlation fields, child loggers, and central redaction are good. Error serialization, telemetry scrubbing, and outage-volume control need work.                                        |
| Metrics instrumentation |  6/10 | HTTP golden signals, Node defaults, worker, outbox, files, notifications, privacy, auth, and realtime signals exist. There is no governed metric catalog and several essential dependency/queue signals are absent. |
| Distributed tracing     |  4/10 | Auto-instrumentation, batching, trace response headers, log correlation, and exemplars exist. Production export is not wired, async context is not propagated through jobs/events, and sampling is fixed.           |
| Health and readiness    |  6/10 | API and worker expose separate live/ready endpoints and check core dependencies. API readiness is coupled to worker fleet health and some checks can be expensive or slow.                                          |
| Alerting                |  5/10 | A useful first alert set and runbooks exist. Delivery is not production-wired, important alerts are absent, and some PromQL/annotations are incorrect or non-generic.                                               |
| Dashboards              |  5/10 | Existing rows are readable and data-source correlation is well configured. Coverage, scoping, correctness, taxonomy, and cost controls are incomplete.                                                              |
| Telemetry security      |  2/10 | Application metrics require a token, but the production overlay exposes unauthenticated telemetry services and an admin/default Grafana credential.                                                                 |
| Reliability             |  4/10 | Retention exists for Loki/Tempo and application containers have limits. The telemetry containers lack restart/resource policies and cannot detect several failures in their own pipeline.                           |
| Cloud-cost control      |  3/10 | Some retention and bounded application logs exist. Broad log discovery, 10-second scrape/refresh rates, fixed trace sampling, and missing storage/ingestion caps allow avoidable spend or disk exhaustion.          |
| Documentation and tests |  5/10 | Runbooks and architecture checks are valuable. Several claims are stale, and CI does not validate the effective production observability stack, rules, or dashboard queries.                                        |

## What was already implemented correctly at audit time

These parts should be preserved and strengthened rather than redesigned:

1. **Structured production stdout is reliable.** [`logger.service.ts`](../apps/api/src/infrastructure/logger/logger.service.ts)
   emits JSON to stdout in production even when `LOKI_HOST` is absent. When direct Loki delivery is
   configured, stdout remains a target. This corrects a finding in the older starter re-audit.
2. **Correlation is coherent.** Request IDs, tenant/user context, active OpenTelemetry trace/span IDs,
   response `x-trace-id`, and user-visible error references are connected across the API, clients,
   logs, and error filter.
3. **Central redaction exists.** Credentials, tokens, cookies, email/recipient fields, storage keys,
   and selected IP fields are redacted by the Pino logger.
4. **HTTP metric cardinality is intentionally bounded.**
   [`metrics.interceptor.ts`](../apps/api/src/infrastructure/metrics/metrics.interceptor.ts) uses the
   Fastify route template instead of raw URLs. This avoids a common path-ID cardinality failure.
5. **Prometheus exemplars link latency samples to traces.** Grafana data sources also connect
   Prometheus to Tempo and Loki trace IDs to Tempo.
6. **Worker metrics now exist.** The worker exposes a small metrics/health HTTP server, protects
   `/metrics` with the production token, and the production Prometheus file scrapes API and worker
   separately. This also corrects an older audit finding.
7. **Health endpoints distinguish liveness and readiness.** The worker checks Postgres and Redis for
   readiness and exposes a dependency-free liveness endpoint. API shutdown/drain support exists.
8. **Useful domain-neutral operational metrics exist.** Outbox depth/age/retries/dead letters,
   BullMQ failures/stalls, worker heartbeat, auth outcomes, rate limits, realtime lag/dead letters,
   file reconciliation, notification backlog, and privacy export backlog are meaningful starter
   signals.
9. **Retention is configured for bundled Loki and Tempo.** Loki retains 30 days and rejects overly
   old samples; Tempo retains traces for 24 hours. Analytics reporting is disabled.
10. **Runbooks are present and named by incident.** `RB-01` through `RB-19` give the repository a good
    operational documentation base. The rules check currently verifies architecture and runbook
    mapping successfully.
11. **The browser has bounded error capture.** Global errors and error boundaries report a validated,
    size-limited payload through a rate-limited API route, with client-side duplicate suppression.
12. **Application container logs are bounded in production.** The API, worker, web, Nginx, and migration
    containers inherit Docker `json-file` rotation settings.

## Initial findings and remediation requirements

These findings describe the defects found at audit time. The repository-controlled critical and
high-severity items were addressed by the remediation pass; the final section records the current
implementation and verification evidence. Deployment-owned checks remain mandatory before serving
real traffic.

### CRITICAL — OBS-C01: the effective production overlay publicly publishes the telemetry control plane

**Evidence:** [`docker-compose.observability.yml`](../docker/docker-compose.observability.yml) publishes
Prometheus `9090`, Loki `3100`, Alloy `12345`, Tempo `3200/4317/4318`, Grafana `3001`,
Postgres exporter `9187`, Redis exporter `9121`, Alertmanager `9093`, and cAdvisor `8080`.
[`docker-compose.prod.observability.yml`](../docker/docker-compose.prod.observability.yml) adds profiles,
mounts, and a network but does not remove inherited `ports`.

Rendered with the documented three-file production merge, every port has an empty `host_ip`, which
means all host interfaces. Loki has `auth_enabled: false`; Prometheus enables its lifecycle endpoint;
exporters reveal infrastructure metadata; Tempo accepts OTLP; Alloy exposes its UI; and privileged
cAdvisor mounts the host root, `/var/run`, `/sys`, Docker data, and Docker socket.

**Impact:** An exposed host can leak logs, metrics, traces, topology, database/cache metadata, and
container information. Prometheus configuration can be remotely reloaded. Exposed telemetry intake
can also be abused to consume disk and CPU. The cAdvisor and Docker-socket surfaces increase the
impact of a service compromise.

**Required core fix:** Maintain distinct local and production service definitions. Production should
use internal `expose`, an authenticated reverse proxy or private control-plane network, explicit
firewall/security-group guidance, and no public exporter/collector ports. Bind local ports to
`127.0.0.1`. Do not give a production profile an unprotected host Docker socket unless the deployment
model explicitly requires and isolates it.

### CRITICAL — OBS-C02: production Grafana uses a known default administrator credential

**Evidence:** The rendered production configuration contains
`GF_SECURITY_ADMIN_USER=admin` and `GF_SECURITY_ADMIN_PASSWORD=admin` because the local default is
inherited.

**Impact:** Combined with the published Grafana port, this is direct administrative compromise of the
observability UI and its configured data sources.

**Required core fix:** Make production startup fail unless a secret-backed credential or external
identity provider is configured. Disable anonymous access, rotate session/signing secrets, and
document role mapping. Local `admin/admin` can remain a clearly local-only convenience.

### HIGH — OBS-H01: production alert delivery is still a local-development configuration

**Evidence:** [`alertmanager.yml`](../docker/observability/alertmanager/alertmanager.yml) sends SMTP to
`mailpit:1025` and `on-call@modular-monolith.local`. The production Compose file has no Mailpit. The
Slack example is not mounted by the production profile, and `${SLACK_WEBHOOK_URL:?...}` is not by
itself an Alertmanager-native secret interpolation mechanism.

**Impact:** Prometheus can mark incidents as firing while no human receives them. This defeats the
operational purpose of the alert set.

**Required core fix:** Add a production-rendered Alertmanager template using secret files or the
deployment platform's secret injection, with a mandatory receiver and a startup/config validation
step. Prove delivery with a synthetic alert before release. Provider-specific PagerDuty/Slack/email
routing remains deployment-specific.

### HIGH — OBS-H02: production database and Redis exporters monitor development endpoints

**Evidence:** The effective production configuration contains
`postgresql://postgres:postgres@postgres:5432/app?sslmode=disable` and `redis://redis:6379`. The
production application explicitly uses externally managed TLS-enabled Postgres and Redis and does
not define local `postgres` or `redis` services.

**Impact:** Database/Redis dashboards and alerts will be empty or show exporter failure. Operators can
mistake the absence of data for healthy dependencies. The Postgres configuration also embeds a known
development credential and disables TLS.

**Required core fix:** Require exporter DSNs through secrets, support TLS, and label the actual
cluster/database. For managed services, document provider-native exporters or managed metrics as a
valid alternative. Remove the hard-coded `app` database name from reusable dashboards and alerts.

### HIGH — OBS-H03: production traces are not sent to the bundled Tempo service

**Evidence:** [`env.schema.ts`](../packages/contracts/src/schemas/env.schema.ts) defaults
`OTEL_EXPORTER_OTLP_ENDPOINT` to `http://localhost:4318/v1/traces`.
[`docker-compose.prod.yml`](../docker/docker-compose.prod.yml) does not inject an OTLP endpoint into
the API or worker. Inside those containers, `localhost` is the application container, not `tempo`.

**Impact:** Tempo and trace links can remain empty while documentation claims tracing is available.
Exporter retries/errors can also add noise and work without producing useful telemetry.

**Required core fix:** Inject `http://tempo:4318/v1/traces` in the bundled profile, or require a managed
collector endpoint. Make tracing explicitly enabled/disabled instead of treating a localhost default
as universally reachable. Exercise an API-to-worker trace in deployment validation.

### HIGH — OBS-H04: observability services have no resource, restart, PID, or local log limits

**Evidence:** None of the nine observability services has `restart`, `mem_limit`, `cpus`, or
`pids_limit` in the rendered production configuration. Images use mutable tags rather than immutable
digests. This differs from the bounded API/web/worker production services.

**Impact:** A log storm, high-cardinality metrics, or trace burst can exhaust the host and take down the
application it is meant to observe. A telemetry service may stay down after a crash. Re-pulls can
change binaries without a reviewed release.

**Required core fix:** Supply conservative per-service memory/CPU/PID/log limits, restart policies,
storage reservations, and pinned image digests. Production deployments must put telemetry on
separate capacity or use managed services when application availability must not share its failure
domain.

### HIGH — OBS-H05: log collection scope and volume controls can leak data and create cost spikes

**Evidence:** [`config.alloy`](../docker/observability/alloy/config.alloy) discovers every Docker
container visible through the host socket. It relabels all discovered targets but has no keep filter
for this application. Loki has retention but no repository-configured ingestion/burst/per-stream
limits. If `LOKI_HOST` is set while Alloy is active, the app sends logs directly and Alloy also reads
the same stdout, creating duplicates.

**Impact:** A shared host can ship unrelated workloads into this Loki instance. A failure loop or
attacker-generated client errors can rapidly consume disk and cloud log ingestion. Duplicate delivery
doubles volume and complicates incident counts.

**Required core fix:** Select exactly one log-shipping path, filter discovery by Compose project or an
explicit label, configure ingestion and stream limits, monitor dropped/received bytes, and alert on
storage/ingestion budgets. Rate-limit repeated dependency failure logs. Keep identifiers such as user,
tenant, request, and trace IDs in structured fields, never indexed Loki labels.

### HIGH — OBS-H06: dashboard scope is not safe for multi-environment or multi-instance operations

**Evidence:** The API dashboard only has route/container variables. The data dashboard has no
variables. Queries generally aggregate all jobs and instances; database queries hard-code
`datname="app"`; database hit-ratio expressions mix databases; Redis queries can mix instances. There
are no environment, cluster, region, service, role, instance, deployment version, database, or Redis
instance selectors.

**Impact:** Centralized Prometheus deployments can combine staging and production or multiple
applications, hiding a single bad replica and producing incorrect ratios. A reusable starter cannot
assume every database is named `app`.

**Required core fix:** Define common resource labels (`environment`, `service`, `role`, `cluster`,
`region`, `version`) at scrape/export time and make dashboards filter on them. Add datasource,
environment, service/role, and instance variables; add database/cache variables where meaningful.
Aggregate ratios only within a selected scope.

### HIGH — OBS-H07: the dashboard catalog omits important signals already emitted by the application

**Evidence:** No provisioned dashboard visualizes notification delivery outcomes/backlog/dead items,
privacy export outcomes/backlog/age, realtime consumer lag/dead letters/reaped groups, file cleanup,
the rate-limit Redis fallback, circuit-breaker state/trips, or client runtime errors. The existing
realtime panel queries HTTP active requests and does not use `realtime_active_connections_total`.

**Impact:** Engineers must know metric names and build ad hoc queries during incidents. The realtime
panel can report a healthy-looking number while WebSocket connections or Redis stream consumption are
failing.

**Required core fix:** Add focused dashboards for async pipelines/realtime and telemetry/security.
Feature-module panels should be provisioned only when those modules are enabled. Correct the realtime
connection panel to use the registry gauge, split by `type`.

### HIGH — OBS-H08: essential capacity and dependency metrics are absent

The code does not expose application Postgres pool total/idle/waiting/acquisition time, application
Redis connection/reconnect/error state, BullMQ waiting/active/delayed depth, oldest job age, job
duration/throughput, external provider latency/outcomes, object-storage latency/errors, antivirus
scan latency/outcomes, or error-reporter delivery outcomes. Postgres exporter metrics do not reveal
per-process pool exhaustion.

**Impact:** The current stack can detect many failures after requests/jobs fail, but it cannot diagnose
approaching saturation or estimate drain time. ERP/CRM workloads often fail first at pool, queue, and
provider boundaries.

**Required core fix:** Add low-cardinality infrastructure adapters for pool, Redis, queue, provider,
and storage signals. Keep product business metrics in project modules.

### HIGH — OBS-H09: alert coverage and some alert expressions are not production-correct

Concrete defects:

- Redis hit-ratio expression and panel use a 40% threshold, while the alert description says 60%.
- Database-size alerts hard-code `datname="app"`; size is not a disk-free-space signal despite the
  disk runbook association.
- Container CPU uses host-core percentage without normalizing by container CPU quota. A service
  limited to 0.5 CPU may be saturated without reaching the 85% expression.
- No alerts cover Redis memory/evictions/rejected connections, Postgres connection saturation,
  deadlocks or remaining storage, queue depth/oldest age, realtime lag/dead letters, circuit-breaker
  state, telemetry ingestion failures, or stale/no-data gauges.
- Prometheus does not scrape Alertmanager, Loki, Tempo, Grafana, or Alloy health, so much of the
  observability stack can fail silently.
- There are no multi-window SLO/error-budget burn alerts. The API error and latency alerts are useful,
  but fixed thresholds alone do not distinguish a short incident from sustained budget consumption.

**Required core fix:** Correct PromQL and descriptions, add dependency/capacity/telemetry self-health
alerts, and provide configurable availability/latency SLO recording and burn-rate rule templates.
Products should choose actual SLO values; the starter should provide the mechanism and examples.

### HIGH — OBS-H10: API readiness turns worker degradation into API unavailability

**Evidence:** In production, the API worker health indicator scans Redis heartbeat keys and reports
readiness down when no worker is active. The production API container health check uses readiness,
and Nginx waits for the API to be healthy.

**Impact:** A worker outage can remove otherwise functional API replicas from service and cause a
complete synchronous outage. That is an unsafe coupling unless every API request strictly requires a
live worker.

**Required core fix:** Keep API readiness limited to dependencies required to serve synchronous
requests. Expose worker fleet degradation as a metric/alert and, where needed, reject only endpoints
that require asynchronous capacity. A product may intentionally choose stricter readiness, but it
should be an explicit policy.

### HIGH — OBS-H11: async traces do not preserve request/event causality across processes

**Evidence:** BullMQ workers create spans, but queue jobs and outbox/event envelopes do not inject and
extract W3C trace context. Worker spans therefore start from the worker's current process context and
are not reliably linked to the originating API request.

**Impact:** The most important production investigations—request accepted, event persisted, job
retried, provider called—are split into unrelated traces.

**Required core fix:** Add versioned trace context fields to generic job/event metadata, inject at
enqueue/publish, extract at consume, and create consumer spans with appropriate parent/link semantics.
Do not put trace context inside business payloads.

### HIGH — OBS-H12: CI does not validate the production observability artifact

**Evidence:** CI validates the base production Compose file and pooling profile, but not the three-file
observability merge. The documented production merge fails with `.env.prod.example` because
`METRICS_TOKEN_FILE` is absent. No committed `promtool` rule tests or dashboard query/lint checks were
found.

**Impact:** Public ports, default credentials, missing variables, bad PromQL, and stale dashboard
queries can merge despite all current checks passing.

**Required core fix:** In CI, render the exact production observability merge with safe fixtures,
assert no forbidden published ports/default credentials, run `promtool check config` and
`promtool test rules`, validate Alertmanager, parse/lint dashboards, and verify referenced application
metrics exist. Add a smoke test that starts the stack, emits a request/job, and queries all three
telemetry stores.

### HIGH — OBS-H13: external error reports and client errors lack a formal telemetry data policy

**Evidence:** The server error reporter forwards exception message/stack plus request/user/tenant
context to an arbitrary external URL. It has timeout and circuit-breaker protection but no scrubber
before serialization. Client error messages/stacks are logged, and the attacker-accessible endpoint
is public with a 30-per-minute rate limit.

**Impact:** Provider/database exceptions and client stacks can contain personal or sensitive values.
A distributed source can use the public endpoint to generate substantial logs despite per-key rate
limiting.

**Required core fix:** Run error payloads through an allowlist/scrubber, define retention and data
residency expectations, add delivery/drop/volume metrics, sample or aggregate repeated client errors,
and set a deployment-level intake budget. Keep stack traces available to operators without treating
them as safe by default.

### MEDIUM — OBS-M01: metric creation is dynamic and contains a histogram reuse defect

[`metrics.service.ts`](../apps/api/src/infrastructure/metrics/metrics.service.ts) creates instruments
from arbitrary names and the label keys of the first call. A later call with different labels can
throw. Its histogram path checks for an existing registered metric but still constructs a new
histogram before choosing the existing one; in a second application context or hot reload, duplicate
registration can throw twice. Current mocked unit tests do not exercise the real global registry.

Create a typed metric catalog with fixed type/help/labels/buckets and validate label cardinality.
Fix reuse before construction and test against the real registry with multiple service instances.

### MEDIUM — OBS-M02: `realtime_active_connections_total` is a gauge with counter naming

The value is incremented and decremented, so it should be named `realtime_active_connections`.
The `_total` suffix convention implies a monotonic counter and invites invalid `rate()` queries.

### MEDIUM — OBS-M03: error logging frequently loses useful Error serialization

Many call sites log `{ error }`, while Pino's standard Error serializer convention is normally the
`err` field and no explicit `error` serializer is configured. Native Error properties such as stack
and message are non-enumerable and can be reduced to an empty object. The all-exceptions filter's
`{ err }` pattern is the stronger example.

Standardize error fields or configure a serializer, then test nested/cause/provider errors. Throttle
recurring dependency errors; the current Redis/rate-limit/worker loops can emit one line per event or
request during outages.

### MEDIUM — OBS-M04: tracing lacks deployment identity and tunable cost controls

The SDK sets service name only. It does not configure environment, version, region/cluster, instance,
or deployment attributes. Production root sampling is fixed at 20% and cannot be tuned per
environment or route. Shutdown handles `SIGTERM` only.

Make sampling and resource identity explicit configuration, retain parent-based sampling, exclude
routine health/metrics noise, and flush on every supported graceful shutdown path. Tail sampling is an
optional collector capability for larger deployments.

### MEDIUM — OBS-M05: health checks need bounded dependency behavior

The API worker indicator performs a complete Redis `SCAN` on each readiness evaluation. This remains
non-blocking per call but scales with the heartbeat keyspace and runs repeatedly. Dependency health
checks do not wrap each probe in an explicit health-check timeout. The worker heartbeat timestamp is
updated before the Redis write, so it means “attempted heartbeat,” not “Redis heartbeat succeeded.”

Maintain an aggregate worker-fleet key or exporter metric, cap probe duration, and name/alert on local
process and Redis-observed heartbeat separately.

### MEDIUM — OBS-M06: alert metadata is too weak for multi-team incident routing

Alerts have severity but generally lack owner/team, service, environment, component, and `runbook_url`
labels/annotations. Thresholds are hard-coded. As more teams reuse the starter, routing and ownership
will become ambiguous.

Provide common alert labels and direct runbook URLs, with deployment-specific external labels and
threshold configuration.

### MEDIUM — OBS-M07: the Grafana information architecture is readable but too monolithic

All dashboards are provisioned into one folder named `Architecture`. The API dashboard contains 33
panels across API golden signals, internal pipelines, workers, auth, Node, containers, and logs. Rows
make it readable, but an incident responder must load and query unrelated systems. Both dashboards
refresh every 10 seconds; the large dashboard can generate significant repeated query load.

Provision focused dashboards and use a 30-second or 1-minute default for production overview pages.
Reserve short refresh for a focused live-troubleshooting view.

### MEDIUM — OBS-M08: provisioned dashboards can drift from source and contain repository-specific links

File-provisioned dashboards are `editable: true`, so UI edits can be overwritten or differ from Git.
Dashboard links target the original public repository/runbooks, which becomes wrong for forks and
private applications.

Make production dashboards non-editable or document an export/review workflow. Parameterize or remove
repository-specific URLs.

### MEDIUM — OBS-M09: documentation contains confirmed drift

- [`RB-08`](runbooks/RB-08-worker-silent-death.md) tells operators to scan
  `worker:heartbeat:node:*`; code writes `worker:heartbeat:<hostname>:<pid>`.
- [`RB-16`](runbooks/RB-16-realtime-lag.md) calls realtime lag the primary signal while no alert or
  provisioned panel uses it.
- Queue runbooks refer to queue depth, but BullMQ depth/age is not emitted.
- README says the Grafana dashboard includes traces; there is no trace dashboard, only Tempo Explore
  integration.
- [`PRODUCTION_OPS.md`](PRODUCTION_OPS.md) says alert rules cover dependencies and instructs operators
  not to expose metrics/Grafana publicly, while the effective production configuration contradicts
  both statements.
- [`PRODUCTION_STARTER_REAUDIT_2026-09-15.md`](PRODUCTION_STARTER_REAUDIT_2026-09-15.md) still says
  production can lose stdout logs, worker metrics are not exposed, and Loki retention is absent.
  Those three findings have since been corrected and should be marked superseded.

Treat operational docs as tested artifacts: metric names, key patterns, routes, alert names, and links
should be checked against code in CI where practical.

### LOW — OBS-L01: dashboard incident ergonomics can improve

Most panels have no description, dashboards have no deployment/incident annotations, and there is no
obvious link from a firing alert to a pre-filtered dashboard. Add concise panel descriptions for
non-obvious ratios, deployment annotations, and alert-to-dashboard/runbook links.

### OPTIONAL — OBS-O01: user-experience and mobile telemetry

The browser reports runtime errors, but there are no Web Vitals, route/navigation timing, API client
latency, release adoption, or mobile crash/performance signals. A small provider-neutral interface is
appropriate in core; RUM/session replay/mobile crash SDKs and dashboards should be optional modules
because they have privacy, cost, and vendor implications. Session replay should never be enabled by
default.

### OPTIONAL — OBS-O02: business and ERP/CRM domain dashboards

Orders processed, invoice failures, inventory drift, lead conversion, workflow SLA, and other business
metrics do not belong in the generic platform dashboards. The starter should define metric naming,
ownership, low-cardinality rules, and dashboard provisioning conventions. Each project should own its
domain signals and access policy.

## Initial dashboard categorization review

### Current state

| Dashboard                      | Current organization                                                                                         | Assessment                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API & Service Performance      | Eight rows: golden signals; routes; outbox/realtime/cache; workers; auth/rate limits; Node; containers; logs | Row names and ordering are understandable. It is too broad, loads 33 panels, mixes application and host concerns, and omits several emitted signals.                                            |
| Database & Redis Observability | PostgreSQL row followed by Redis row                                                                         | Clean at the current size. Split only when each data store gains the capacity, locks, replication, persistence, and application-client panels needed for production. Add scope variables first. |
| Grafana folder                 | Everything under `Architecture`                                                                              | Too vague for a reusable operational catalog and does not scale to multiple teams or project modules.                                                                                           |

The existing row categorization is therefore **good for local demonstration, insufficient for
production incident response**. The issue is not visual disorder inside the JSON; it is missing
coverage and an information architecture that will not scale.

### Recommended provisioned hierarchy

Use folders and dashboards with stable numeric ordering:

```text
Platform
  00 Service Overview & SLOs
  10 API & Authentication
  20 Workers & Queues
  30 Outbox & Realtime
  40 Runtime & Containers
  50 Telemetry Pipeline & Cost

Data
  10 PostgreSQL
  20 Redis
  30 Object Storage & File Processing       # when file module enabled

Foundation Modules
  10 Notifications                           # when enabled
  20 Privacy Export & Erasure                 # when enabled
  30 Security & Client Errors

Project Domains
  <project-owned dashboards only>
```

Recommended content boundaries:

- **Service Overview & SLOs:** availability, RPS, error rate, p50/p95/p99, saturation, burn rate,
  current alerts, deployments, and links to detail dashboards.
- **API & Authentication:** route performance, auth outcomes, rate-limit behavior, request/response
  size, overload, client cancellations, and API error references.
- **Workers & Queues:** fleet health, waiting/active/delayed/dead counts, oldest age, throughput,
  duration, retry/stall/failure rate, and drain-time estimate.
- **Outbox & Realtime:** outbox depth/age/retries/dead letters; SSE/WebSocket connections by type;
  stream lag, pending entries, dead letters, and reaped consumers.
- **Runtime & Containers:** event-loop lag, heap/RSS/GC/CPU, container quota-normalized CPU, memory,
  OOM, network, restarts, and capacity.
- **Telemetry Pipeline & Cost:** Prometheus/Loki/Tempo/Alloy/Alertmanager health, samples/log bytes/span
  ingestion, rejected/dropped data, active series/streams, storage use, retention, and estimated budget
  consumption.
- **PostgreSQL/Redis:** both provider/server metrics and the application's client/pool view.
- **Foundation module dashboards:** provision only with the module. This keeps the base starter small.

Every dashboard should share datasource, environment, cluster, service/role, instance, and version
variables. Default dashboards should show fleet health, then allow an engineer to narrow to one
replica. Tenant IDs, user IDs, request IDs, trace IDs, job IDs, record IDs, and URLs must not become
metric labels or dashboard variables backed by Prometheus labels.

## Initial signal coverage matrix

| Capability                                |            Emitted            |  Dashboard   |  Alert  | Status                                                                                   |
| ----------------------------------------- | :---------------------------: | :----------: | :-----: | ---------------------------------------------------------------------------------------- |
| API traffic/error/latency/active requests |              Yes              |     Yes      |   Yes   | Good base; add scope/SLOs and saturation context                                         |
| Node process/runtime                      |              Yes              |     Yes      | Partial | Metrics visible; alerts/capacity tuning incomplete                                       |
| Worker process/heartbeat                  |              Yes              |     Yes      |   Yes   | Production scrape exists; API readiness coupling and heartbeat semantics need correction |
| BullMQ failures/stalls/errors             |              Yes              |     Yes      |   Yes   | Failure-only coverage; depth, age, duration, throughput absent                           |
| Outbox depth/age/retry/dead letter        |              Yes              |     Yes      |   Yes   | Strongest async coverage; add delivery throughput and scoped queries                     |
| Realtime connections                      |              Yes              | Wrong signal |   No    | Panel queries HTTP activity; rename gauge and alert on abnormal state                    |
| Realtime consumer lag/dead letter/reaping |              Yes              |      No      |   No    | Major operational gap                                                                    |
| Cache operations                          |              Yes              |     Yes      |   No    | Add fallback/error and hit-ratio semantics where useful                                  |
| Rate-limit rejections                     |              Yes              |     Yes      |   No    | Add Redis-unavailable/fail-open/fail-closed view and alert                               |
| Authentication outcomes/lockouts          |              Yes              |     Yes      |   No    | Dashboard useful; define abuse alerts by deployment policy                               |
| Email circuit breaker                     |              Yes              |      No      |   No    | Missing provider dashboard/alert                                                         |
| Notification delivery                     |              Yes              |      No      |   Yes   | Alerted but not diagnosable in dashboard                                                 |
| Privacy export pipeline                   |              Yes              |      No      |   Yes   | Alerted but not diagnosable in dashboard                                                 |
| File cleanup/reconciliation               |              Yes              |   Partial    | Partial | Reconciliation only; scan/storage/provider signals missing                               |
| Postgres server                           |           Exporter            |     Yes      | Partial | Exporter production target broken; capacity/locks/deadlocks/storage absent               |
| Postgres application pool                 |              No               |      No      |   No    | Must-have core gap                                                                       |
| Redis server                              |           Exporter            |     Yes      | Partial | Exporter production target broken; memory/eviction/saturation alerts absent              |
| Redis application client                  |              No               |      No      |   No    | Should-have core gap                                                                     |
| Client runtime errors                     |            Logged             |      No      |   No    | Capture exists; volume/release/outcome view absent                                       |
| Traces                                    |           Intended            | Explore only |   No    | Production endpoint broken; async continuity absent                                      |
| Telemetry stack self-health/cost          | Partial exporter self-metrics |      No      | Partial | Must-have production gap                                                                 |

## Initial cloud-cost assessment

At audit time, the repository did not prove that observability spend was bounded. The immediate
risks were:

| Cost driver          | Current control                                              | Remaining risk                                                                                       | Required control                                                                                      |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Prometheus           | 10-second scrape; default local storage behavior             | No size retention cap; all targets at high frequency; active-series growth unmonitored               | Retention time **and size**, tiered scrape intervals, cardinality tests, active-series/storage alerts |
| Grafana queries      | Dashboard defaults to one hour                               | Both dashboards refresh every 10 seconds; the 33-panel page repeatedly scans metrics/logs            | 30s–1m overview refresh, focused live view, query budgets/caching where supported                     |
| Loki                 | 30-day retention; rejects old samples                        | All host containers collected; no ingestion/burst/stream/storage budget; duplicate shipping possible | Workload filter, one shipping path, ingestion/stream limits, byte/storage alerts                      |
| Tempo                | 24-hour retention; 20% root sampling                         | Sampling fixed and production exporter miswired; no ingestion/storage budget                         | Configurable head sampling, optional tail sampling, span/storage alerts, route exclusions             |
| Client/server errors | Payload length limits, IP/key rate limiting, circuit breaker | Public intake and repeated outage logs can still generate large volume                               | Aggregation/sampling, global deployment budget, drop/delivery metrics, log throttling                 |
| Telemetry containers | None in production overlay                                   | Can consume host resources or stay down; mutable tag pulls                                           | CPU/memory/PID/log/storage caps, restart policy, immutable digests                                    |

For AWS or another cloud, account-level budgets and anomaly alerts remain deployment-owned, but the
starter must provide a checklist and alarms for log/metric/trace ingestion, storage, egress, managed
database metrics, and notification volume. No repository can guarantee that cloud bills will never
rise unexpectedly; it can make unsafe growth visible and enforce bounded defaults.

## Core foundation versus optional capability

### Must have in the core before v1.0

- Private/authenticated production telemetry topology and secret-backed Grafana/Alertmanager.
- Correct API/worker trace export and cross-process trace-context propagation.
- Stable resource labels and a typed metric catalog with cardinality rules.
- API, queue, data-store client/pool, telemetry self-health, and cost/capacity signals.
- Focused overview, API, async, data, runtime, and telemetry-health dashboards.
- Correct and tested alert rules, receiver validation, runbook links, and SLO templates.
- Resource/storage/ingestion limits and one clearly owned log-shipping path.
- CI validation of the exact production observability merge, Prometheus, Alertmanager, and dashboards.
- Telemetry redaction/data-classification policy and failure-loop volume controls.

### Should have in the core

- Deployment/version annotations, release markers, and common dashboard variables.
- Configurable sampling and health probe timeouts.
- Browser client-error metrics and release grouping without capturing sensitive payloads.
- A managed-observability integration contract documenting required metrics, labels, traces, logs,
  alerts, and retention regardless of vendor.

### Optional modules/plugins

- Web Vitals/RUM, mobile crash analytics, synthetic journeys, session replay, and profiling.
- PagerDuty, Slack, Datadog, Sentry, CloudWatch, or other provider adapters.
- Module dashboards for files, notifications, privacy, billing, search, and integrations.
- Tail-sampling collectors and long-term metrics/object storage for larger deployments.

### Should not be embedded in the generic boilerplate

- ERP/CRM-specific business KPIs or fixed business SLO values.
- A mandatory observability vendor.
- Tenant/user/record identifiers as metric labels.
- Public production telemetry UIs for convenience.
- Default session replay or capture of request/response bodies.

## Production-readiness exit criteria

### P0 — release blockers

1. Rendered production config has no public Prometheus/Loki/Tempo/Alloy/exporter/Alertmanager/cAdvisor
   ports; Grafana is private or behind authenticated TLS ingress.
2. Production cannot start with `admin/admin`; every telemetry secret comes from a secret file/store.
3. Postgres/Redis exporters use the real secured dependencies or are deliberately disabled in favor
   of managed metrics.
4. API and worker traces arrive in Tempo/managed tracing and link to logs; one API-to-job path preserves
   causality.
5. A synthetic alert reaches the real on-call receiver and resolves successfully.
6. Telemetry services have resource/restart/storage/log limits and the log collector selects only the
   intended workloads.
7. CI renders and validates the exact production observability profile.

### P1 — required for a dependable starter

1. Add scoped labels/variables and split the dashboard catalog according to the recommended hierarchy.
2. Correct realtime, database, Redis, and quota-normalized container queries.
3. Add queue depth/age/duration, DB pool, Redis client, provider/storage, and telemetry self-health
   instrumentation.
4. Add missing alerts, SLO burn rules, runbook URLs, ownership labels, and alert unit tests.
5. Fix metric registry reuse, gauge naming, error serialization, telemetry scrubbing, and failure-log
   throttling.
6. Decouple API readiness from the worker fleet and bound health checks.
7. Reconcile README, operations docs, runbooks, and the older re-audit with the implementation.

### P2 — adopt by project need

1. Browser performance/RUM and mobile crash telemetry.
2. Synthetic business journeys and provider-specific cloud dashboards.
3. Continuous profiling, tail sampling, and long-term telemetry storage.
4. Project-domain KPIs and application-specific SLOs.

## Validation performed

- `pnpm observability:check` passed against the exact production Compose merge and all provisioned
  dashboard JSON.
- `promtool` accepted the local and production Prometheus configurations and all 31 alert rules.
  Loki accepted its configuration with `-verify-config=true`; Alertmanager accepted its local
  configuration; Grafana Alloy accepted its formatted configuration.
- `pnpm rules:check` passed: 606 modules and 2,390 dependencies were checked with no dependency
  violations; generated design tokens and repository rules were current.
- The complete unit suite passed before the final configuration-only cleanup: 247 test files and
  1,085 tests. The final API unit run passed all 158 files and 812 tests, including metric reuse,
  queue polling/trace metadata, realtime lag, and error-report bulkhead behavior.
- `pnpm lint`, `pnpm format:check`, and the serial monorepo production build passed. The build
  completed all nine build tasks, including web client/SSR, API, packages, and mobile export.
- A live local stack returned ready responses for Prometheus, Grafana, Loki, Tempo, Alloy,
  Alertmanager, and cAdvisor. A labeled smoke container was discovered by Alloy and queried from Loki
  with the expected collector, container, service, and stream labels.
- Fresh Alloy and Loki logs contained no delivery/configuration errors. A one-minute Loki query
  confirmed that unlabeled cAdvisor warning noise was no longer ingested. Runtime inspection showed
  every telemetry container below its configured CPU, memory, and PID limit.

## Direct answer

The repository observability foundation is now suitable for serious ERP, CRM, SaaS, and custom
applications. Its dashboard catalog is divided into API/service, data-store, asynchronous pipeline,
and telemetry-health concerns; application/domain dashboards can be added without turning one page
into a dumping ground. The stack has bounded defaults and failure isolation appropriate for the
starter's single-host deployment model.

This conclusion applies to the repository implementation. A production release must still prove the
selected cloud's private access controls, alert delivery, storage sizing, ingestion budgets, and load
profile. For larger or regulated systems, the documented managed-observability integration contract
should be used instead of assuming the bundled single-host services are a highly available telemetry
cluster.

## Remediation verification (2026-09-15)

The implementation pass following this audit addressed the repository-controlled blockers:

- Production observability services no longer publish host ports; resource, PID, restart, and
  Prometheus retention limits are enforced by the production overlay.
- Grafana and Alertmanager now require deployment-time secret files/credentials. A production
  Alertmanager template is provided without embedded secrets.
- API and worker OTLP endpoints are required in the production Compose profile, with configurable
  bounded trace sampling. Alloy ships only services explicitly marked with the
  `observability.logs=true` label, so production API/worker/web/proxy logs are collected without
  sweeping infrastructure or unrelated host workloads.
- Prometheus self-scrapes the telemetry stack; Loki ingestion is rate-limited; database pool, Redis
  client, BullMQ, realtime, and provider health metrics/alerts are present.
- Dashboard queries are tenant/application neutral where labels exist, the catalog is read-only and
  grouped under the `Platform` folder, and async-pipeline and telemetry-health dashboards were added.
- Metric registry reuse, realtime gauge naming, error serialization/scrubbing, and rate-limit log
  cardinality were corrected. CI now renders the exact production observability merge, validates all
  dashboard JSON, and runs `promtool` checks for production Prometheus config and alert rules.
- Queue trace context now uses BullMQ telemetry metadata instead of changing domain job payloads;
  queue polling cannot overlap during Redis latency, and error-report delivery has a five-request
  bulkhead so an exception storm cannot create unbounded outbound telemetry work.
- Application scrapes run every 15 seconds and infrastructure scrapes every 30 seconds with
  per-target sample limits. Loki retention is seven days with bounded total and per-stream ingestion.
  Alloy caps active streams, adds a safe collector label to every batch, and excludes its own and
  Loki's logs to prevent feedback during a telemetry failure.

The remaining production evidence is deployment-specific: configure a private authenticated operator
endpoint, render Alertmanager with real recipients, connect an OTLP backend, verify alert delivery,
and exercise retention/budget alarms in the selected cloud. Those controls cannot be proven from a
repository-only audit and remain required pre-traffic evidence in `docs/PRODUCTION_OPS.md`.
