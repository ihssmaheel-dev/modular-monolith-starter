# Architecture starter re-audit — 22 September 2026

Audited revision: `74deb0d07479bba4dc4e5fe385d4c1bc634d1382`, branch `main`.

Compared with: `8d077ddbd8c55fe0d57f25e6467b693841dbef4c`, assessed in [the previous audit](ARCHITECTURE_STARTER_AUDIT_2026-09-21.md).

## Verdict

**The changes improve the starter, but they do not close all the previous findings. I would start application development on this foundation; I would not approve this revision unchanged as a production-ready release.**

The architectural foundation remains **8/10**. Current production readiness is approximately **6.5/10**, up from 6/10 in the previous report. These are engineering assessments, not measurements or security certification. The improvements are real; the remaining failures affect production behavior and cannot be outweighed by a passing build or a large unit-test count.

There are **five remaining HIGH findings** from the previous audit. Four affect supplied application capabilities: production browser hydration, durable consumer outcomes, file scanning, and SSE backpressure. The fifth concerns the optional PgBouncer deployment path and applies when that path is enabled. No new CRITICAL vulnerability was confirmed in this re-audit.

Notes remains a reference feature throughout this assessment. The project is evaluated as a reusable modular application foundation for ERP, CRM, SaaS, and other serious products.

## Scope and verification

This is a change-focused re-audit across application code, shared clients/contracts, deployment, observability, dependencies, documentation, and AI instructions. The checkout contains 1,342 tracked files; the three new commits change 62 files relative to the prior audited revision. I compared the changes, revisited every previous finding, traced relevant unchanged callers and dependencies, and ran fresh checks and targeted failure probes.

This is not a claim that every line of the repository was manually reread. Unchanged areas retain the earlier audit's scope and limitations. No application source, configuration, dependency, or branch was changed during this review. This report is the only intended tracked addition.

### Fresh checks

| Check                                 | Result                                          | What it establishes                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm rules:check`                    | Passed                                          | Configured architecture, convention, and generated-token checks; dependency analysis covered 652 modules and 2,557 dependencies.                        |
| Forced workspace type checks and lint | Passed, 14 tasks, no Turbo cache                | Ten type-check tasks and four implemented lint tasks.                                                                                                   |
| Forced workspace unit tests           | Passed, 1,285 tests, five tasks, no Turbo cache | API 990; web 170; mobile 96; authorization 22; API client 7.                                                                                            |
| API E2E                               | Passed, 39 tests                                | Isolated PostgreSQL/Redis test containers; API role, not full worker failure recovery.                                                                  |
| PostgreSQL integration                | Passed, five tests in two files                 | Restricted-role tenant isolation and outbox RLS checks against a separate, migrated PostgreSQL container.                                               |
| Fresh and upgrade migration checks    | Passed                                          | Repository migration checker against the isolated database server; migration application also passed.                                                   |
| Migration lineage                     | Passed                                          | Seven immutable migration files match their frozen checksums.                                                                                           |
| Fresh production web build            | Passed, five tasks, no Turbo cache              | Actual current web and dependency build.                                                                                                                |
| Web bundle budget                     | Passed                                          | 73 JavaScript assets; 396,661 aggregate gzip bytes. This is not initial-page transfer size.                                                             |
| Observability validator               | Passed                                          | Configuration assertions and dashboard JSON; not proof of runtime correctness or bounded cloud bills.                                                   |
| `pnpm audit --json`                   | Zero reported vulnerabilities                   | The resolved JavaScript dependency graph, 2,193 dependencies; not container/OS vulnerabilities.                                                         |
| Production CSP browser probe          | Failed                                          | Fresh built SSR server worked without the header; the checked-in production CSP blocked four inline scripts and caused two JavaScript errors in Chrome. |
| Targeted failure probes               | Mixed; detailed below                           | Reproduced remaining outbox, file-scan, SSE, and metric-type problems; verified the realtime cleanup and non-exemplar histogram fixes.                  |

The isolated integration database initially lacked application tables because the migration checker uses its own fresh/upgrade schemas. After explicitly applying the application migrations to that test database, all five integration tests passed. This setup correction is not classified as an application defect.

Runtime qualification: the shell's `node` is 22.23.2, but `pnpm exec node` and the production `srvx` process report 22.12.0 on this machine. The new committed CI/container pin is 22.14.0. These checks therefore do not establish an exact-runtime pass for the committed Docker image. Runtime alignment still needs a clean image build/test.

The failure probes used actual current TypeScript implementations, real RxJS/prom-client/neverthrow and installed Nest event wrapping, with controlled storage/database adapters where stated. They are reproducible logic tests, not a distributed load test. The browser probe used a temporary local proxy applying the checked-in CSP; it did not boot the production Nginx container or validate its entire TLS/proxy configuration.

Not run in this session: the complete browser E2E suite, production Docker image builds/scans, a live PgBouncer/TLS deployment, sustained load/soak tests, a fresh backup restore drill, a rolling deployment/rollback, or cloud billing validation.

## Status of every previous finding

IDs match the previous report. “Resolved” is limited to the named defect and the evidence described here.

| Previous ID                                | Status                                            | Re-audit result                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H01 — Production CSP                       | **Open, HIGH**                                    | Adding a nonce to the header without attaching it to SSR scripts does not permit hydration. Fresh browser reproduction still fails.                                                                                                   |
| H02 — Split-domain CSRF                    | **Default fixed; optional path incomplete**       | The production example now uses one origin and `/api/v1`. Optional `COOKIE_DOMAIN` is implemented in API cookies but not forwarded by production Compose. See M13.                                                                    |
| H03 — Cross-tab refresh                    | **Substantially addressed; residual MEDIUM**      | Web Locks, refresh broadcasts, and cookie-first server selection address the original stale-body-token scenario on supported browsers. Lock/fetch bounds and non-Web-Locks behavior still need work and regression coverage; see M12. |
| H04 — Durable consumer failures            | **Partial, HIGH**                                 | Returned `err()` is detected. Suppressed listener exceptions, success on lookup failure, and duplicate effects after partial success remain.                                                                                          |
| H05 — File scan ownership/failure handling | **Partial, HIGH**                                 | Source metadata/scanner errors now preserve quarantine data. Competing scan owners and destructive promoted-object verification remain.                                                                                               |
| H06 — Competing lock authorities           | **Resolved in standard application wiring**       | Injected Redis lock service now fails closed when unavailable, rather than switching that replica to PostgreSQL. Optional provider-absent fallback still has limitations.                                                             |
| H07 — PgBouncer production path            | **Open, HIGH when enabled**                       | TLS/configuration and session-state concerns remain. Ordinary direct PostgreSQL deployment is not implicated by this finding.                                                                                                         |
| H08 — SSE slow consumers                   | **Open, HIGH**                                    | New counter measures pending microtasks, not pending transport writes. Slow-sink reproduction bypasses the nominal 50-event ceiling.                                                                                                  |
| M01 — Replicated observability             | **Partial, MEDIUM**                               | DNS target discovery and matching aggregate CPU denominators improve the configuration. Project isolation, unlimited-quota handling, and deployment-specific discovery verification remain.                                           |
| M02 — Operational measurements             | **Partial, MEDIUM**                               | Oldest waiting-job ordering and outbox millisecond buckets are fixed. Transaction query logging and queue error span status remain incomplete.                                                                                        |
| M03 — Metrics wrapper                      | **Partial, MEDIUM**                               | Non-exemplar histogram observations now work. Summary-as-Histogram acceptance and empty label-signature handling remain.                                                                                                              |
| M04 — External trace sampling              | **Addressed for the supplied public API ingress** | Nginx strips untrusted trace context on `/api/`; the sampler no longer automatically accepts every sampled remote parent. A sampling ratio remains a statistical control, not a spend ceiling.                                        |
| M05 — Realtime registry leak               | **Resolved in reproduced scenario**               | Disconnecting a tenant and running ordinary cleanup leaves zero connections and zero users; empty alias sets are pruned.                                                                                                              |
| M06 — Browser test infrastructure          | **Open, MEDIUM**                                  | CI still lacks initialized object storage used by upload tests; Playwright still runs the development web server.                                                                                                                     |
| M07 — Documentation/AI drift               | **Partial, MEDIUM**                               | Several important corrections landed. Contradictory transport, session, pooler, event, and token-source guidance remains.                                                                                                             |
| M08 — Dependency override drift            | **Resolved for audited dependency graph**         | Workspace overrides and lockfile are reconciled; fresh dependency audit reports zero advisories.                                                                                                                                      |
| M09 — Architecture claims vs enforcement   | **Open, MEDIUM**                                  | The pragmatic layered modular monolith remains good; it still is not strict dependency inversion or full aggregate-based DDD everywhere.                                                                                              |
| M10 — Reference-module removal             | **Open, MEDIUM for reuse**                        | Disabling remains supported, but the prune script still reports obsolete source paths and does not remove the whole example surface.                                                                                                  |
| L01 — Runtime image contents               | **Open, LOW**                                     | Runtime stages still copy the installer workspace; ownership changes do not prune build dependencies.                                                                                                                                 |
| L02 — Turbo version mismatch               | **Resolved**                                      | Root/API/web Dockerfiles now use Turbo 2.11.2 consistently with the repository.                                                                                                                                                       |
| L03 — Lost SSE connected message           | **Resolved by implementation**                    | `ReplaySubject(1)` retains the initial event until the transport subscribes.                                                                                                                                                          |

## Remaining high-priority defects

### H01 — The production CSP still prevents correct hydration

**HIGH · Must fix in the core deployment.**

Evidence: `docker/nginx.conf:55`, `docker/nginx-insecure.conf:38`, and `apps/web/src/routes/__root.tsx`.

The policy now contains `'nonce-$request_id'` and `'strict-dynamic'`. Sending `X-Request-ID` upstream does not automatically make TanStack/React emit that value as a script nonce. The web source has no corresponding nonce integration, and the rendered scripts in the probe had empty nonce attributes.

A fresh `/auth` build served without the CSP produced no page errors. With the checked-in policy and a concrete per-response request ID, Chrome blocked four inline scripts and twice reported `Cannot set properties of undefined (setting 't')`.

**Required completion:** propagate a deliberately generated per-response nonce into all framework bootstrap/hydration scripts through the framework's supported rendering mechanism, and make the header agree with the rendered document. Preserve a strict policy. Verify authentication form interaction and client navigation behind the actual production proxy, not just that HTML returns 200.

### H04 — Consumer failure propagation is not yet a reliable delivery contract

**HIGH · Must fix in core event processing and first-party durable consumers.**

Evidence: `outbox/workers/outbox-event.worker.ts:68` and `:176`; `modules/users/application/listeners/welcome-email.listener.ts:31`; `modules/notifications/application/listeners/domain-event-fanout.listener.ts:54` (paths relative to `apps/api/src`).

The new worker check correctly detects a consumer's returned neverthrow `err()`. That is a meaningful fix. Three gaps remain:

1. **Unexpected exceptions can still become success.** Required listeners use `@OnEvent(...)` without disabling Nest's default exception suppression. `WelcomeEmailListener` awaits email rendering outside its queue `try/catch`. An exception there is logged/suppressed by the installed Nest wrapper and returns `undefined`; the worker accepts that value and can publish the event. The probe exercised the installed wrapper and current worker validator: `err()` was rejected, but a wrapped thrown exception was accepted as success.
2. **A lookup failure is explicitly acknowledged.** Invitation fan-out returns `ok(undefined)` for both “recipient absent” and `getUserByEmail.isErr()`. A database failure is not the same as an intentional no-op.
3. **Retries can repeat already successful effects.** The receipt covers the whole event. Notification fan-out does not use the supplied event metadata as a persisted deduplication key; `SendNotificationInput` has no source event ID. If one consumer persists a notification and another fails, replay invokes the successful consumer again and creates another notification. Stable welcome-email job IDs help queue enqueue deduplication, but do not make all effects idempotent.

**Required completion:** make required consumer outcomes explicit, ensure unexpected adapter/framework failures reach the retry boundary, and persist a unique event/consumer/effect identity atomically with database effects. Classify no-op versus retryable failure. Keep `Result` in application code and infrastructure exception adaptation at the queue boundary; there is no need to abandon the project's error model.

**Acceptance test:** one consumer succeeds and another fails, then the event is retried/restarted. The successful database effect appears once; the failed consumer retries; the event becomes published only after required outcomes succeed. Also test thrown renderer/provider exceptions and invitation lookup failure.

### H05 — File scanning still has competing owners and unsafe terminal transitions

**HIGH · Must fix in the supplied file capability before enabling uploads.**

Evidence: `modules/files/application/commands/confirm-upload.command.ts:62`; `application/workers/file-scan.worker.ts:49`; `infrastructure/repositories/files.repository.ts:148` (under `apps/api/src/modules/files`, except the first full path).

Confirmation reads `pending`, writes `uploading` without a compare-and-set condition, then calls `scanOne` inline. The scheduled worker independently claims `uploading` rows using `FOR UPDATE SKIP LOCKED`. Two confirmations can also read the same pending state. The database claim protects scheduled workers from each other, but not the inline path.

A controlled overlap probe using the current worker and a storage adapter reproduced this sequence: the first scan promotes the object and deletes quarantine; the second scan then observes missing quarantine and marks the same record failed. Output: results `[true, false]`, final database status `failed`, promoted object still present. This is a state-transition reproduction, not a live S3 load test.

The source metadata/scanner transient-error changes are good. However, `file-scan.worker.ts:88` still treats an error reading the **promoted** object's metadata as a mismatch, deletes the promoted object, and marks failure. An unavailable storage service is not proof that uploaded bytes are invalid. Final repository update Results also need deliberate handling.

**Required completion:** one shared atomic claim path, owner/version-aware final transitions, idempotent promotion, and separate retryable unavailability from confirmed integrity failure. A worker lease/retry budget should prevent abandoned scans or repeated provider outages from becoming permanent uncontrolled work. Preserve quarantine until promotion is verified and state is committed.

**Acceptance tests:** duplicate confirms, confirm-versus-cron overlap, worker crash after copy, transient source/final metadata failure, and a stale worker attempting to overwrite an already completed state.

### H07 — Optional transaction-mode PgBouncer remains an unvalidated production path

**HIGH when this optional path is selected · Fix or narrow the supported deployment claim.**

Evidence: `docker/pgbouncer-entrypoint.sh:26`, production Compose's `pooling` service, `packages/contracts/src/schemas/env.production.ts:16`, `apps/api/src/infrastructure/database/connection/database-pool.ts:24`, and `docs/DATABASE.md`.

The generated PgBouncer configuration supplies neither client TLS termination nor upstream TLS configuration. Production environment validation requires a TLS-enabled database URL. Simply pointing that URL at this pooler does not establish the required encrypted path.

The connection hook still sends session-level `SET statement_timeout`, `SET lock_timeout`, and `SET idle_in_transaction_session_timeout`. A transaction pool does not reserve one server session for that application connection between transactions. The documentation's statement that the application uses no session-level `SET` is therefore false. Transaction-local tenant context is correctly implemented; it does not automatically make unrelated session settings safe.

The provider-absent PostgreSQL advisory-lock fallback also uses the normal pool, not a dedicated direct connection, and does not abort the callback on connection loss. This is not the standard Redis-backed path, but it should not be advertised as equivalent clustered safety.

**Required completion:** test an actual encrypted app → pooler → PostgreSQL deployment, apply timeout policy at a pooler-safe boundary, verify RLS and cancellation across reused sessions, and document direct-connection requirements accurately. Keeping direct PostgreSQL as the supported v1 path while deferring this optional profile is acceptable. Do not weaken TLS validation to make the example start.

### H08 — The new SSE limit does not bound a slow client's pending writes

**HIGH · Must fix in core realtime if SSE is exposed.**

Evidence: `apps/api/src/infrastructure/realtime/connections/realtime-connection.dispatcher.ts:39` and the installed Nest/RxJS SSE write path.

The dispatcher increments a WeakMap counter before `subject.next` and decrements it in `queueMicrotask`. A microtask completing says nothing about whether the HTTP stream has drained. Events arriving across separate event-loop turns can accumulate in the transport's serialized write queue while this counter repeatedly returns to zero.

The probe blocked the first asynchronous sink write and emitted 100 events across event-loop turns. Only one write started; the subject stayed open; zero slow clients were dropped; releasing the sink then processed all 100 events. The nominal limit was 50. This demonstrates retained downstream backlog despite the new counter; it does not estimate memory consumption under a particular production workload.

**Required completion:** bound the actual transport queue/bytes using write completion/drain, or use a bounded hint/coalescing channel with an explicit resynchronization contract. Disconnect an over-budget client without waiting behind its entire old backlog. A `sync_required` event enqueued into an already blocked stream cannot itself guarantee timely recovery.

Keep the working WebSocket watermark, connection admission limits, and improved registry cleanup. The remaining problem is specific to SSE transport backpressure.

## Remaining medium and low findings

### M01 — Replicated metrics need a complete identity model

**MEDIUM · Should fix in core observability.** `prometheus.prod.yml` now uses DNS A-record discovery for API/worker targets, and `alerts.yml:224` aggregates both sides of the CPU ratio. The previous many-to-many denominator problem is corrected.

DNS discovery covers replicas only when the deployment exposes every replica as a DNS answer. A service VIP is not equivalent. CPU aggregation still uses Compose service alone, merging identically named services from separate projects. Unlimited/nonpositive CPU quotas are not excluded, so utilization can be invalid or hide a busy service. Add fixtures for two replicas, two projects, and an unlimited container; label/group by the intended project/environment and service identity.

### M02 — Two measurement gaps remain

**MEDIUM · Should fix in core observability.** `queue.service.ts:147` now requests ascending waiting jobs, and `outbox-relay.delivery.ts` supplies millisecond buckets. Those corrections should be retained.

The slow-query wrapper still instruments `pool.query`, while checked-out transaction clients can bypass it (`database/connection/database-pool.ts:45`). Queue worker failure handling records an exception but does not set error span status (`queue.service.ts:199`). Do not describe these as complete transaction slow-query coverage or reliably error-classified job traces. Add targeted assertions for those actual execution paths, preserving SQL parameter redaction.

### M03 — Metric registration can still silently accept the wrong type

**MEDIUM · Should fix in the shared metrics adapter.** The non-exemplar histogram regression is fixed and the real prom-client probe confirms it. However, `metrics.service.ts:16` treats any object with `observe` and `startTimer` as a histogram, accepting a real Summary. Histogram bucket queries then do not match what was registered. The label-signature check near the end of the service still uses a truthiness test, which fails to distinguish an existing empty signature from no signature.

Use an explicit metric kind/signature and test actual registered Counter/Gauge/Histogram/Summary objects. This is an adapter edge case, not evidence that all current request metrics fail.

### M06 — Production and failure paths are not covered by the current green test result

**MEDIUM · Should fix in core test infrastructure.** `.github/workflows/ci.yml` supplies PostgreSQL, Redis, and Mailpit; it points S3 at port 9000 without provisioning/initializing MinIO. `apps/web/e2e/auth-and-notes.spec.ts` exercises a real upload. API E2E containers do not provide object storage for the browser suite.

`apps/web/playwright.config.ts` still starts Vite dev. It cannot catch the production CSP defect. The changes add one API unit test for the metrics exemplar path; there are no corresponding new tests for the changed scanner, durable consumer, refresh, SSE, or lock failure scenarios. A passing existing suite does not establish these fixes.

Provision isolated test storage and add focused production-browser, cross-tab refresh, duplicate-effect, scanner-race, slow-SSE, and lock-outage tests. These are meaningful behavioral tests; they need not become a large mock-only suite.

### M07 — Documentation and AI instructions still contain conflicting engineering guidance

**MEDIUM · Must fix the authoritative starter instructions.** The changes correctly repair memory-only token guidance, append-only migration guidance, several controller examples, Fastify-inject terminology, file-size rule alignment, generator help, and parts of the runbooks. The remaining examples are consequential:

| Source                                                                     | Remaining discrepancy                                                                                                     | Required correction                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ai_instructions/I18N_RULES.md:44`                                         | A recommended controller accepts `any` and returns `{ status, body }`. That object alone does not set Nest's HTTP status. | Use the actual typed controller/error adapter pattern already corrected elsewhere.                                     |
| `ai_instructions/MODULE_RULES.md`                                          | Controller guidance still describes returning the status/body envelope.                                                   | Reconcile the mandatory transport examples across rule files.                                                          |
| `ai_instructions/EVENT_AND_ERROR_RULES.md:44`                              | An application example still uses `body: any`, despite the mandatory no-`any` rule.                                       | Use the public input type.                                                                                             |
| `docs/PRODUCTION_ARCHITECTURE.md:233`                                      | Says the relay marks `PUBLISHED` after enqueue.                                                                           | Describe consumer-completion publication and its actual guarantees.                                                    |
| `docs/DATABASE.md`                                                         | Says Redis-unavailable execution falls back to PostgreSQL; claims no session-level `SET` and safe pooled session reset.   | Document the new fail-closed Redis behavior and the actual pooler limits.                                              |
| `docs/adr/0042-hybrid-session-model.md`                                    | Describes offline account-version verification and Redis-only revocation degradation.                                     | Reconcile with the authentication guard's fresh user/version lookup and actual outage behavior.                        |
| `ai_instructions/README.md`, `docs/adr/0061-single-react-via-overrides.md` | Claim a single React runtime enforced by root overrides.                                                                  | The workspace overrides pin React types; web/mobile use their compatible runtime versions. Document that deliberately. |
| `ai_instructions/FRONTEND_RULES.md:47`                                     | Directs developers to keep design tokens in UI CSS.                                                                       | Point to the design-token preset source and generated outputs.                                                         |
| `ARCHITECTURE_DEEP_DIVE.md:166`                                            | Describes query-client reuse as a shared singleton without the server distinction.                                        | State that server calls create isolated clients; the browser reuses one.                                               |
| `ai_instructions/FILE_PLACEMENT_RULES.md`                                  | Some quick-reference entries remain broader than the corrected public-contract/private-type distinction.                  | Make the quick table agree with the top-level placement rule.                                                          |

The SSR query-client implementation itself correctly returns a new client on the server; the stale prose is not evidence of an implemented shared-server-cache leak. Similarly, do not force an incompatible mobile React upgrade merely to satisfy the old ADR.

The observability validator's “production-safe” output is broader than its static checks establish. Prefer wording that says configuration validation passed, with runtime smoke/failure checks separate.

### M09 — Keep the architecture claims proportional to what is enforced

**MEDIUM for long-term maintainability · Should improve core boundaries incrementally.** The module/layer layout and dependency rules are useful. Application use cases still directly depend on concrete same-module repositories and framework services; cross-module application imports are allowed; some query code uses `unknown as` shape casts.

This is a practical layered modular monolith with CQRS use-case separation and Lite DDD, as ADR 0008 describes. It is not universal port-based dependency inversion or full tactical DDD. Do not generate interfaces/aggregates just to change that label. Add ports at genuine substitution or complex domain boundaries, avoid optional correctness-critical dependencies in production wiring, and use aggregates when business invariants require them. Describe the current contract accurately so new teams do not assume rules enforce more than they do.

### M10 — Example disabling is still different from example removal

**MEDIUM for starter reuse · Should fix in initialization tooling.** `scripts/prune-examples.js:32` still lists `apps/web/src/routes/_authenticated/notes` and `apps/mobile/app/(app)/notes`; the real routes use different paths. The command modifies environment flags rather than removing registrations, contracts, clients, routes, tests, or migration assumptions.

Keep disabling as a safe supported operation. Correct the status paths and provide a tested removal checklist or deliberate removal command. Preserve applied migration history. This does not mean generic privacy/storage infrastructure depends on Notes business logic; the main remaining problem is initialization/removal completeness.

### M11 — Updated version pins do not yet establish a maintained runtime baseline

**MEDIUM · Should fix in dependency and deployment maintenance before release.** Docker/CI now consistently pin Node 22.14.0, and the Docker Turbo mismatch is fixed. However, Node 22.14.0 dates to February 2025, and the local pnpm runtime differs from both the shell and committed pin. Select and test a current supported patch in the chosen release line; a framework or runtime-major replacement is not required merely for novelty. [Node 22.14.0 release](https://nodejs.org/en/blog/release/v22.14.0), [Node release support policy](https://nodejs.org/en/about/previous-releases).

The observability image change selects Grafana 11.5.2. Grafana's published support table puts 11.5.x end of support at 28 October 2025, before this audit. Use a supported release and verify provisioned dashboards/data sources after upgrading. This is a confirmed support-policy gap, not a claim that a specific exploitable container CVE was reproduced. [Grafana support policy](https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/).

Docker/Compose Dependabot coverage and build provenance are worthwhile additions. They are update/evidence mechanisms, not proof that the chosen images are current, have passed a clean scan, or that a deployment verifies provenance. The new provenance actions also use mutable `@v2` tags; align them with the workflow's existing immutable action-pinning policy.

### M12 — Cross-tab refresh needs bounded failure behavior and a supported-browser test

**MEDIUM residual from H03 · Should fix in shared authentication infrastructure.** `packages/api-client/src/utils.ts:85` serializes refresh using `navigator.locks`; the backend prefers the shared refresh cookie (`auth.controller.ts:152`), and the web broadcasts refreshed state. These changes address the previous ordinary stale-tab sequence without disabling replay detection.

The refresh fetch has no application timeout/AbortSignal. A tab holding the origin-wide lock during a stalled request can hold up other tabs' refresh attempts until the browser/network ends it. Browsers/contexts without Web Locks fall back to per-instance coordination, leaving concurrent cross-tab rotation unprotected. The code check for `navigator.locks` acknowledges this fallback, but there is no defined alternative guarantee.

Bound request and lock acquisition waits, define supported environments or a tested fallback, and test two-tab sequential/concurrent expiry, stalled refresh, holder termination, stale body credentials, and genuine token replay. I did not run those complete browser scenarios in this session; the original happy-path fix is recognized from the implementation, not presented as full browser certification.

### M13 — Optional cookie-domain configuration stops before production Compose

**MEDIUM when using split subdomains · Optional deployment capability.** `COOKIE_DOMAIN` exists in the contract and is used for CSRF/auth cookies. The production example mentions it, but `docker/docker-compose.prod.yml` uses explicit environment maps that do not forward it. Setting it in the interpolation `.env` file does not automatically inject it into the API container.

The corrected same-origin defaults do not need this setting. Either make same-origin the explicit supported path and remove the incomplete split-domain hint, or wire and test the whole optional path. A shared parent-domain auth cookie broadens credential scope to its subdomains; choose cookie scope and CSRF bootstrap deliberately rather than widening every cookie as an incidental workaround.

### L01 — Runtime images still contain more than the runtime needs

**LOW · Deployment cleanup.** The web and API runner stages copy the installer workspace. Non-root ownership is good, but build tools, source, and development dependency content still increase image size and scanning/deployment surface. Package the runtime's required outputs and dependencies. Keep Node inside the containers; the host does not need Node/pnpm to run Docker images.

### L04 — The new staging launcher can report success on process-launch failure

**LOW · Tooling cleanup.** `scripts/staging-up.js:24` exits with `result.status ?? 0`. A child process that fails to launch or terminates without an exit status can therefore become success. Check `result.error`/signal and default to a nonzero failure. Normal Docker command exit statuses are already forwarded correctly; this concerns the exceptional launch path.

## Observability, memory, and cloud cost assessment

**The observability foundation is substantial and sensibly organized, but it is not fully verified or free of remaining defects.**

The six provisioned dashboards are all in the Grafana **Platform** folder, with useful separate purposes:

| Dashboard                      | Role                                                               | Assessment                                                           |
| ------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| API & Service Performance      | Request rate, errors, latency, saturation, routes                  | Appropriate operator entry point.                                    |
| Async Pipelines & Realtime     | Queues, outbox, notifications, privacy, realtime/provider behavior | Correct grouping of asynchronous workflows.                          |
| Database & Redis Observability | Database and cache infrastructure                                  | Good shared dependency view.                                         |
| Object Storage (Universal)     | Application-level storage operations and reliability               | Correctly distinct from provider internals.                          |
| MinIO Cluster Internals        | MinIO-specific capacity, drives, cluster behavior                  | Keep conditional on MinIO usage; it is not a universal S3 dashboard. |
| Telemetry Health & Capacity    | Monitoring services, telemetry volume, storage pressure            | Necessary to operate the observability stack itself.                 |

There is no need for another major folder reorganization now. The next work should improve measurement correctness, tenant/project/replica selectors where operationally appropriate, real alert tests, and runbook accuracy. Static JSON validity does not establish that every panel has data under every deployment topology.

Positive cost/memory controls already present include bounded process resources and rotated container logs; Prometheus 15-day/10-GB retention; Loki seven-day retention, ingestion and stream limits; Tempo 24-hour retention; sampled/batched tracing; bounded caches and connection admission; storage quotas; and retained-job/stream cleanup. The registry leak reproduction is fixed. Do not remove these controls.

Remaining risks include:

- SSE can still retain downstream events for slow clients; H08 is the clearest confirmed memory-growth path in this review.
- File retries/copies and duplicate consumer effects can generate unnecessary storage, database, queue, and notification work. H04/H05 affect cost as well as correctness.
- DNS discovery and CPU label semantics must be correct before scaling decisions depend on dashboards.
- A rate or retention limit is not a billing cap. For example, a continuous 1 MB/s input is roughly 86 GB/day before compression; this is an illustration of volume, not an estimate of this application's observed usage or invoice.
- Database/outbox/audit growth, object versions, external email/push/AI calls, network egress, backups, and autoscaling require project-specific retention, quotas, and provider budgets. Container memory limits do not limit those costs.
- The default trace ingress improvement should be retained. Other ingress paths must apply an explicit trust policy, and production sampling must be tested under representative traffic. Do not describe a sample ratio as a hard limit on daily trace count.

**I cannot responsibly certify “no memory leaks,” “no security threats,” or “AWS costs cannot spike.”** This review identifies concrete remaining risks and existing controls. Release evidence should include a bounded load/soak scenario, provider-outage tests, representative telemetry volume measurements, volume growth alerts, and cloud budget notifications. Hard usage limits belong in expensive capability adapters; budget ownership belongs to each deployment.

## Architecture and structure

The backend module structure, infrastructure capabilities, public contracts, frontend features, thin routes, shared UI/design tokens, and mobile separation remain appropriate. The repository is not a single-folder dump, and adding another business module does not inherently require redesigning the foundation.

The dependency rules reject configured cross-module infrastructure/domain/presentation access, domain/framework coupling, and cycles. Public contracts and localization have clear owners. Direct database transactions, backend permission enforcement, tenant context/RLS, account lifecycle extension points, and separate API/worker roles remain important strengths from the prior audit. The fresh restricted-role database tests give additional evidence for tenant isolation; they are not an authorization proof for every future business endpoint.

At hundreds of screens or 100K–500K lines, likely pressure points are shared contract/permission/event registries, cross-module application coupling, concrete infrastructure dependencies, and a large global provider surface. Use capability ownership and small public application APIs. Do not add directory layers merely to make a tree look more enterprise-oriented. Keep domain invariants inside the owning module, and avoid turning `common`, `shared`, or `contracts` into homes for private implementation types.

No new framework, queue platform, database, microservice split, or mandatory intelligence layer is required to address this audit. The existing stack can support the intended architecture. Completing its integration guarantees is higher value than introducing new technology.

## What belongs in the foundation

| Classification                                 | Capabilities or corrections                                                                                                                                                                                                                                                                                                | Reason                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Must have in core**                          | Secure configuration; production HTTP/browser security; authentication/session lifecycle; backend authorization hooks; transaction/RLS boundaries; typed errors/contracts; tenant context; tested durable-consumer contract; migration discipline; bounded transport behavior; health/shutdown; consistent AI instructions | Every consuming application inherits these correctness and security assumptions.                                 |
| **Should have in core**                        | Logs/metrics/traces with cost controls; focused failure/contract tests; project initialization; provider adapter contracts; capability ownership; supported runtime/update policy; CI image and migration verification                                                                                                     | Repeated cross-project needs that reduce operating and maintenance work.                                         |
| **Optional modules/profiles**                  | Organization workflows; actual file/notification features; SSE/WebSockets; PgBouncer; managed/self-hosted observability bundles; OAuth/OIDC/MFA integrations; search; Python intelligence; advanced integrations                                                                                                           | Useful by workload. Their enabled implementation must still be safe; optional does not mean exempt from testing. |
| **Application-specific, not boilerplate core** | ERP accounting, CRM pipelines, CAFM assets, APS scheduling, legal retention schedules, business audit semantics, bespoke ABAC attributes, AI prompts/models/workflows and product-specific provider budgets                                                                                                                | These encode the consuming application's domain and risk model.                                                  |

Keep tenant-aware interfaces and access boundaries reusable while allowing single-tenant deployments. Do not turn every optional product capability into a mandatory service or background process.

## Updated scorecard

Scores describe the current revision and evidence, not maximum potential. Missing optional business features are not counted as defects.

| Area                  | Score / 10 | Reason                                                                                                                                 |
| --------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture          | 8          | Strong modular layout and executable boundaries; pragmatic layering rather than universal dependency inversion.                        |
| Security              | 7          | Substantive controls and clean dependency audit; production browser policy, optional deployment paths, and runtime maintenance remain. |
| Authentication        | 7.5        | Strong existing password/session controls; meaningful cross-tab improvements need timeout/fallback tests.                              |
| Authorization         | 8          | Backend permission/resource checks and RLS foundation; new product policies still require explicit tests.                              |
| Database              | 8          | Explicit transactions, append-only migrations, and passing real RLS tests; optional pooler path is incomplete.                         |
| Scalability           | 7          | API/worker split, bounded pools and queues; SSE and multi-replica operational behavior need validation.                                |
| Reliability           | 6          | Partial-consumer failure and file state races remain release blockers.                                                                 |
| Performance           | 7          | Bounded resources and passing bundle budget; no new throughput or soak benchmark.                                                      |
| Background jobs       | 7          | Retry/claim/dead-letter mechanisms exist; some first-party workflows do not preserve the intended guarantees.                          |
| Event architecture    | 6          | Real transactional outbox; acknowledgement and per-effect idempotency remain incomplete.                                               |
| Frontend architecture | 8          | Feature organization, state separation, contracts, and reusable UI; deployment hydration is unresolved.                                |
| API design            | 8          | Shared validated contracts, transport parity, consistent error infrastructure.                                                         |
| Testing               | 7          | Extensive fresh passing checks; critical production/failure paths are still missing from regression coverage.                          |
| Observability         | 7          | Useful categorization and substantial instrumentation; remaining semantics/coverage/support issues.                                    |
| DevOps                | 6.5        | Image/release tooling, provenance, and configuration checks; supplied production paths still need end-to-end proof.                    |
| Developer experience  | 8          | Useful scripts/generators/rules; authoritative documentation remains contradictory in places.                                          |
| Maintainability       | 7.5        | Good file/module discipline; improve public boundaries and avoid proliferating exceptional fallback paths.                             |
| Reusability           | 8          | General-purpose foundation; reference-feature removal is not yet complete tooling.                                                     |
| Extensibility         | 8          | Capability modules and lifecycle hooks are appropriate; no microservice rewrite required.                                              |
| Production readiness  | 6.5        | Improved baseline, but four application capability blockers plus an optional deployment blocker remain.                                |

## Recommended completion order

1. **Fix CSP and add a production-proxy browser smoke test.** This is a default deployment correctness issue.
2. **Complete durable consumer outcomes and effect idempotency.** Test partial success and unexpected exceptions before projects copy the listener pattern.
3. **Unify file-scan ownership and state transitions.** Test confirm/worker overlap and storage unavailability before enabling uploads.
4. **Implement real SSE backpressure.** Verify bounded queued bytes/events with an intentionally slow HTTP client.
5. **Validate the supported database deployment.** Either finish TLS/pooler semantics with a live test or explicitly defer the optional profile.
6. **Complete refresh failure bounds and browser coverage.** Preserve cookie precedence, cross-tab coordination, and reuse detection.
7. **Finish observability semantics and supported image updates.** Add replicated PromQL fixtures and verify dashboards against real metrics.
8. **Repair authoritative documentation and CI dependencies.** Treat example snippets as code contracts; make storage/browser tests reproducible.
9. **Run a clean production build, deployment smoke, failure/recovery drill, and representative load/soak test.** Record supported capacity and cost assumptions from measurements.

The right next milestone is a verified release of this existing foundation. The fixes do not justify restarting the architecture. They do need complete behavioral tests before the starter is promoted as a foundation that future projects can deploy without revisiting these shared guarantees.
