# Architecture starter audit — 21 September 2026

Audited revision: `8d077ddbd8c55fe0d57f25e6467b693841dbef4c` on `main`.

## Verdict

**This is a credible, reusable application foundation. It is not yet a production release I would approve unchanged for a serious ERP, CRM, or multi-tenant SaaS.** The architecture does not need to be replaced. Several integration and failure-handling defects need to be corrected before applications inherit them.

My assessment is **8/10 for the architectural foundation and 6/10 for current production readiness**. These are engineering judgments, not benchmark results or a security certification.

You can begin project-specific domain development on this foundation while completing the release requirements below. I would not launch a sensitive application or distribute this revision as a fully hardened starter until the high-severity findings have been resolved and verified.

Notes is treated throughout this report as a reference vertical slice. Its business functionality is not a measure of the starter's quality.

## Scope and evidence

The repository inventory contained 1,338 tracked files: API, web, mobile, eight shared packages, infrastructure/deployment configuration, migrations, scripts, documentation, and twelve mandatory AI instruction files. I reviewed the repository structure and architecture rules, then traced security-sensitive and failure-sensitive paths through their implementations, contracts, configuration, and tests.

The substantive review covered authentication and session rotation; backend and frontend authorization; tenant context and RLS; database transactions; outbox, workers, locks and retries; file upload/scanning; privacy lifecycle; realtime; caches; metrics, logs and traces; dashboard provisioning; frontend state and routing; CI, Docker and deployment; dependencies; and documentation drift.

This is a repository-wide engineering audit with targeted runtime verification. It is not a claim that every line of all 1,338 files was manually inspected, nor a penetration test, sustained load test, cloud deployment, or mobile device certification. No application source, deployment configuration, branch, or dependency was changed during the audit. This report is the only intended tracked addition.

### Checks actually performed

| Check                                 | Result and scope                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm rules:check`                    | Passed. Dependency analysis covered 652 modules and 2,555 dependencies; no prohibited cycles or configured boundary violations. Token and style-rule checks passed.                                                         |
| Forced workspace type checks          | Passed, 10 tasks, bypassing Turbo cache.                                                                                                                                                                                    |
| Forced workspace lint                 | Passed, 4 implemented lint tasks, bypassing Turbo cache.                                                                                                                                                                    |
| Forced unit tests                     | Passed, 1,284 tests: API 989; web 170; mobile 96; authorization 22; API client 7. Five test tasks ran without cache.                                                                                                        |
| API E2E                               | Passed, 39 tests using isolated PostgreSQL/Redis test containers. The suite uses the API process role; this does not validate all background workers.                                                                       |
| PostgreSQL integration                | Passed, 5 tests in 2 files against an isolated PostgreSQL container, including restricted-role tenant and outbox RLS checks.                                                                                                |
| Fresh and upgrade migrations          | Passed against the isolated PostgreSQL server. Migration lineage check also passed for 7 immutable migrations.                                                                                                              |
| Web build and bundle budget           | Build command passed using available Turbo artifacts. Bundle budget passed: 73 JavaScript assets, 396,469 total gzip bytes. This is aggregate asset size, not first-page transfer size.                                     |
| Production web runtime probe          | Started the built server separately and applied the checked-in Nginx CSP through a temporary local proxy. Chromium reproduced blocked hydration scripts and JavaScript errors.                                              |
| Real-library probes                   | Reproduced a MetricsService exemplar error and incorrect metric-type acceptance; reproduced an empty realtime registry entry remaining after disconnect; confirmed remote-parent sampling bypasses the root sampling ratio. |
| Observability configuration validator | Passed. This validates configuration consistency, not successful production operation or replicated PromQL semantics.                                                                                                       |
| Formatting                            | Selected application source, authorization package, architecture documentation, README, and AI instruction checks passed. This was not a claim of a fresh format check of every tracked asset.                              |
| Dependency audit                      | 0 high/critical, 3 moderate, 1 low advisory in the resolved dependency graph. Details below.                                                                                                                                |
| Frozen lockfile metadata check        | Passed in a temporary copy of workspace manifests using offline, lockfile-only installation. This was not a clean production image build.                                                                                   |

I did not run the full browser E2E suite against your existing development services, rebuild both production Docker images, execute a real production rolling deployment, test backup restoration in this session, or run sustained load/soak tests. Passing the checks above must not be presented as those results.

## What is implemented well

1. **Module boundaries are executable rules.** `.dependency-cruiser.cjs` discovers modules and rejects cross-module infrastructure/domain/presentation imports, controller-to-repository imports, domain-to-framework coupling, and circular dependencies. This is materially better than architecture diagrams alone.
2. **There is a consistent vertical-slice pattern.** Modules own application commands/queries, domain types and errors, persistence, and presentation. Shared transport contracts live in `packages/contracts`. The domain layer remains comparatively small and testable.
3. **The blanket request transaction problem has been addressed.** Database work now uses explicit command/repository transaction scopes. Ordinary login no longer holds a database connection through the entire HTTP request and password verification flow. Short read transactions remain intentional for transaction-local tenant context.
4. **Tenant isolation has multiple layers.** Membership resolution, backend permission checks, tenant-aware repository filtering, explicit system scope, and forced PostgreSQL RLS work together. Restricted-role integration tests exercise actual database isolation. Application database credentials still need to follow the documented non-superuser model.
5. **Authentication has substantive protections.** Argon2, dummy verification for unknown accounts, generic invalid-credential responses for unverified accounts, failure accounting, rotating refresh tokens, reuse detection, key IDs, issuer/audience checks, and fresh account-version verification exist. The previously reported unverified-email password oracle is not present in the reviewed login implementation.
6. **Authorization is a backend boundary.** The shared evaluator supports explicit deny, tenant constraints, action permissions, ownership and registered attribute/context policies. Backend guards and resource checks enforce access; frontend guards are UX helpers. A UI permission check is not being treated as the sole defense.
7. **Durable processing infrastructure is real.** Transactional outbox records, versioned envelopes, bounded claims, retry/backoff, dead-letter handling, operation receipts, and separate API/worker process roles exist. The problems below concern the end-to-end guarantees, not absence of queues or an outbox.
8. **Digest concurrency has improved.** `digest.worker.ts` and `batches.repository.ts` use transactional preparation and row locking with `FOR UPDATE SKIP LOCKED`. Notification rows, delivery intents, batch state and outbox work are coordinated. The earlier claim that every replica simply selects and duplicates the same pending digest is no longer accurate.
9. **Privacy has a reusable extension boundary.** `DataLifecycleRegistry` avoids importing Notes into privacy orchestration. Account erasure retains an anonymized/deactivated identity tombstone. Export size, batch size, attempts and expiry are bounded. Business retention still belongs to the consuming product.
10. **Storage is more than a raw upload endpoint.** Presigning, quarantine keys, metadata verification, conditional/version-aware promotion, private downloads, quotas, lifecycle tags and reconciliation exist. The scanner state transitions need correction, but these foundations should be retained.
11. **There are meaningful operational controls.** Structured/redacted logs, request and trace correlation, health/readiness/liveness, worker health, queue/outbox metrics, error reporting limits, runtime resource limits, log rotation, runbooks, and sampled batched trace export are present.
12. **Several memory structures are bounded.** The distributed cache has a 10,000-entry ceiling and expiry sweeping; realtime has connection limits and a WebSocket send watermark; streams and retained completed/failed jobs have limits. This does not prove all memory or storage growth is bounded, but avoids repeating an inaccurate blanket criticism.
13. **Frontend organization is reusable.** Feature folders, thin routes, shared UI primitives/design tokens, React Query server state, Zustand identity/UI state, centralized API access, i18n, themes, and identity-boundary cleanup are established. Web tokens are not persisted in localStorage; mobile uses SecureStore.
14. **Release hygiene has improved.** CI includes architecture checks, tests, migration checks, a backup/restore verification step, image builds and vulnerability checks. CD validates immutable image digests and produces release artifacts. Producing those artifacts is distinct from proving a live deployment and rollback.

## Confirmed findings

Severity is based on impact in the affected configuration. **No CRITICAL issue was confirmed in this audit.** That does not mean the system is free of critical vulnerabilities. There are **8 HIGH, 10 MEDIUM, and 3 LOW findings** below. Optional capabilities are classified separately.

### H01 — Production CSP blocks web hydration

**Severity: HIGH. Placement: must fix in core deployment. Evidence: runtime reproduction.**

`docker/nginx.conf:55` and `docker/nginx-insecure.conf:38` permit same-origin scripts and one inline hash. That hash matches the theme initializer. The production TanStack response also contains inline router/bootstrap scripts that are not authorized.

The built `/auth` response contained five inline scripts; only the theme script matched the policy. A Chromium run with this exact header reported four blocked-script errors and `Cannot set properties of undefined (setting 't')`. A successful Vite build does not catch this.

**Impact:** the supplied production proxy can serve HTML whose client application fails to hydrate correctly.

**Fix:** integrate a per-response nonce across the SSR renderer and CSP, including framework-generated scripts, or another framework-supported strict CSP strategy. Do not solve this by globally enabling arbitrary inline JavaScript. Add a browser test against the production server behind the actual security headers, verifying navigation and form interaction.

### H02 — The documented split-domain deployment breaks cookie refresh CSRF handling

**Severity: HIGH. Placement: must fix in core authentication/deployment. Evidence: implementation and browser cookie rules.**

`docker/.env.prod.example:45` configures `app.example.com` and `api.example.com`. `apps/api/src/main.ts:157` sets `XSRF-TOKEN` without a Domain attribute, so it is host-only on the API. `packages/api-client/src/utils.ts:38` reads `document.cookie` on the web origin, and `requestRefresh` sends the token from that value. `apps/api/src/common/guards/csrf.guard.ts:29` requires the header when refresh/access cookies accompany a mutation.

The web page cannot read the API host's host-only cookie. SameSite compatibility between subdomains does not grant that access. Consequently, login can succeed while a later cookie-backed refresh fails with 403. [Browser cookie scope reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

**Fix:** make same-origin `/api` proxying the default supported deployment, or implement a deliberate CSRF token bootstrap that works across the supported origins. Keep authentication cookies narrowly scoped. Test the advertised split-domain configuration if it remains supported; localhost ports do not reproduce the cookie-domain distinction.

### H03 — Refresh coordination stops at one tab

**Severity: HIGH. Placement: must fix in shared client and web auth integration. Evidence: traced state transitions.**

`packages/api-client/src/utils.ts:80` shares a pending refresh promise within one client instance. Each tab has its own instance. `apps/web/src/lib/api.ts:18` supplies its in-memory refresh token; successful refresh only updates that tab. `apps/web/src/lib/cross-tab/auth-sync.ts:57` handles sign-in/sign-out, not rotation, and an already-authenticated tab with an access token will not adopt another sign-in response.

`auth.controller.ts:152` prefers the body refresh token over the shared cookie. Thus tab A can rotate T0 to T1 while tab B retains T0. Tab B later submits T0 even if the browser already holds the T1 cookie. `refresh-tokens.command.ts:46` treats this as reuse and revokes the session. Simultaneous cookie-only refreshes also require coordination.

**Impact:** ordinary multi-tab usage can trigger the token-theft defense and log users out. Existing cross-tab tests do not exercise refresh expiry and rotation.

**Fix:** coordinate refresh across browser tabs and propagate/adopt fresh authentication state. Consider a browser cookie-only refresh path while preserving the explicit-token path required by mobile. Keep reuse protection. Test simultaneous and sequential refreshes, tab crashes, stale tabs, and genuine replay.

### H04 — Durable events can be acknowledged after a required consumer failed

**Severity: HIGH. Placement: must fix in core event delivery contract. Evidence: implementation and installed framework behavior.**

`apps/api/src/infrastructure/outbox/workers/outbox-event.worker.ts:64` awaits event emission, completes the event receipt and marks the outbox row published. However:

- `modules/notifications/application/listeners/domain-event-fanout.listener.ts:28` catches errors and only logs failed Results.
- `modules/users/application/listeners/welcome-email.listener.ts:36` falls back from queueing to inline sending and logs a failed send without failing delivery.
- Installed Nest event-emitter code suppresses listener exceptions by default unless explicitly configured otherwise.
- `ai_instructions/EVENT_AND_ERROR_RULES.md:215` directs all listeners to catch and log.

The worker therefore cannot distinguish success from some lost notifications/emails. It will not retry a failure it never receives. Conversely, an event-wide receipt does not prevent duplicate effects when one consumer succeeds and the process crashes before receipt completion. The notification fanout does not pass a source event ID into an effect-level uniqueness constraint.

**Fix:** distinguish best-effort observers from required durable consumers. Required consumers should return an explicit outcome; an infrastructure adapter must propagate failure to the worker without violating the application's Result convention. Add per-consumer/effect idempotency committed with the database effect. Retry transport/provider failures and prove partial success plus process restart does not lose or duplicate required effects. Avoid claiming exactly-once external delivery without provider support.

### H05 — File scanning has competing owners and destructive transient-failure handling

**Severity: HIGH. Placement: must fix in the supplied file module. Evidence: implementation.**

`modules/files/application/commands/confirm-upload.command.ts:73` changes a pending row to uploading and invokes `scanOne` inline. Separately, `files.repository.ts:148` claims uploading rows for the cron worker. The inline path does not acquire that claim, and confirmation is not a conditional pending-to-uploading update.

`file-scan.worker.ts:58` marks a row failed when metadata is unavailable or missing. Scanner unavailable/invalid-response outcomes also reach the failed state and quarantine deletion. A temporary AV outage can therefore discard valid uploaded bytes. Two competing scans can produce another race: one promotes and deletes quarantine; the other observes missing quarantine and overwrites the uploaded state with failed.

**Fix:** use one atomic claim/state machine for all entry points, preferably return a pending/scanning state and let the worker own scanning. Check claim ownership on final updates. Distinguish infected/invalid objects from retryable storage/scanner failures, with bounded backoff and explicit terminal failure. Test concurrent confirmations, cron overlap, temporary AV/S3 outages and crash recovery.

### H06 — Distributed exclusivity uses different lock authorities during an outage

**Severity: HIGH. Placement: must fix in core scheduled-work infrastructure. Evidence: implementation.**

`infrastructure/database/database.service.ts:291` uses Redis when the local client is available and otherwise falls back to PostgreSQL advisory locks. Availability is determined independently by each replica. During asymmetric connectivity, one replica can hold the Redis lock and another can hold the PostgreSQL lock for the same task. These locks do not exclude each other.

The PostgreSQL fallback also uses the ordinary application pool for a session advisory lock. With the supplied transaction-pooling profile, this is not a safe session-lock connection. The fallback AbortSignal is never aborted on connection loss. In the Redis implementation, `Promise.race` signals failure but cannot forcibly cancel an uncooperative callback.

**Fix:** select one authority per deployment; do not switch independently on an individual replica's connection state. Fail closed or use database claims/fencing for correctness. If session advisory locks remain, use a dedicated direct connection and handle loss explicitly. Keep item-level database constraints: the improved digest row locking already protects that path independently.

Session advisory locks are explicitly incompatible with PgBouncer transaction pooling. [PgBouncer feature matrix](https://www.pgbouncer.org/features.html).

### H07 — The optional PgBouncer profile is not a validated production connection path

**Severity: HIGH when pooling is enabled. Placement: fix the optional deployment profile before advertising it as ready. Evidence: checked-in configuration.**

`docker/pgbouncer-entrypoint.sh:29` generates a transaction pool without client TLS configuration or a configured upstream TLS policy. Production validation requires a TLS-enabled `DATABASE_URL`; pointing it at this pooler is not equivalent to a supported direct TLS connection. The compose configuration check only proves YAML interpolation, not a TLS handshake.

Additionally, `database/connection/database-pool.ts:23` sets timeout defaults using connection-level `SET`. Those settings cannot be assumed to follow each logical client through transaction pooling. This is separate from the advisory-lock problem in H06. [PgBouncer configuration](https://www.pgbouncer.org/config.html), [pooling compatibility](https://www.pgbouncer.org/features.html).

**Fix:** provide and test explicit client/upstream TLS settings and appropriate certificate handling. Set required transaction settings within each transaction or through supported server/pool defaults. Test startup, queries, RLS, timeouts, migrations and lock behavior through the actual optional pooler. Disabling this profile until verified is also a reasonable simplification.

### H08 — SSE has no bounded slow-consumer backlog

**Severity: HIGH under sustained event delivery to slow clients. Placement: must fix in realtime infrastructure. Evidence: application and installed dependency source.**

`realtime/connections/realtime-connection.dispatcher.ts:39` forwards events to each SSE Subject without a queue or byte ceiling. Installed Nest code serializes writes through RxJS `concatMap`, waiting for stream drain. While one write waits, subsequent Subject emissions can accumulate in the operator's queue.

WebSocket buffering is explicitly limited; SSE does not have equivalent protection. Connection limits and token expiry bound count/lifetime, not buffered bytes during a connection's lifetime.

**Fix:** implement a bounded per-client queue with a documented overflow behavior, such as coalescing invalidations or disconnecting slow consumers so they refetch durable state. Add slow-reader and reconnect tests measuring retained memory. Do not remove the existing WebSocket limit.

### M01 — Observability loses correctness when services are replicated

**Severity: MEDIUM. Placement: should fix in core deployment observability.**

`docker/observability/prometheus/prometheus.prod.yml:23` has one static `api:3000` target and one `worker:9464` target. Resolving a load-balanced/replicated service name is not per-instance discovery. Some replicas' memory, process health and counters can be invisible or appear to reset as the endpoint changes.

`prometheus/alerts.yml:224` sums CPU by Compose service and divides by an unaggregated quota/period expression matched only on service. Multiple containers with the same service label produce duplicate matches on the right side. The expression also lacks Compose project isolation.

**Fix:** discover and label every replica; evaluate CPU usage per container or aggregate numerator and denominator consistently by project/service. Add PromQL fixture tests with at least two replicas and multiple projects. Static validation passing is not sufficient.

### M02 — Some operational measurements are misleading or incomplete

**Severity: MEDIUM. Placement: should fix in core observability.**

- `queue/queue.service.ts:155` calls `getJobs(["waiting"], 0, 0)` without ascending order. Installed BullMQ defaults to descending order; its dedicated waiting accessor requests ascending order. The reported oldest-waiting age can describe the newest waiting job and understate starvation.
- `outbox/services/outbox-relay.delivery.ts:128` records milliseconds into a histogram without explicit millisecond buckets. Default prom-client buckets top out at 10 before infinity; ordinary multi-second relay latency therefore falls into the overflow bucket.
- `database/connection/database-pool.ts:45` instruments `pool.query`; transaction queries executed through checked-out clients do not all traverse that wrapper. Do not assume the slow-query logger covers every transactional query. OpenTelemetry can still provide complementary spans.
- Queue exception recording does not explicitly set error span status in `queue.service.ts`. Trace consumers that filter by status can miss those failures.

**Fix:** use the correct queue ordering, consistent units/buckets, and deliberate transaction/query instrumentation. Exercise metrics with known values and verify the resulting dashboard/alert behavior.

### M03 — The generic metrics wrapper still has runtime edge cases

**Severity: MEDIUM. Placement: should fix in core telemetry utility. Evidence: real prom-client reproduction.**

`metrics/metrics.service.ts:84` passes the exemplar argument shape to an existing histogram even when that histogram does not enable exemplars. The probe raised `Added label "labels" is not included in initial labelset`. Its histogram duck-type check also accepts a Summary because both expose observe/startTimer. The initial empty label set is not protected by the truthiness check in `assertLabelNames`.

The normal HTTP interceptor catches telemetry failures, and MetricsModule enables OpenMetrics, so this is not evidence that every request currently crashes. It is a fragile reusable API, especially when other modules register metrics.

**Fix:** validate the actual metric type and label signature, handle empty signatures, and discard unsupported exemplar metadata safely. Test against real prom-client objects as well as mocks.

### M04 — External trace sampling can override the configured cost assumption

**Severity: MEDIUM. Placement: should fix at the ingress/telemetry trust boundary. Evidence: installed sampler reproduction.**

`apps/api/src/tracing.ts:29` configures a ParentBasedSampler with a ratio only for root spans. A remote sampled parent defaults to AlwaysOn; the local probe still returned RECORD_AND_SAMPLE with the root ratio set to zero. The provided Nginx configuration does not establish a trusted/untrusted trace-header boundary.

The configured ratio, currently 0.2 by default, therefore is not an upper bound on traces emitted for externally supplied sampled parents. This can increase ingestion and storage under abuse or misconfigured upstream traffic. [OpenTelemetry parent-based sampling specification](https://opentelemetry.io/docs/specs/otel/trace/sdk/#parentbased).

**Fix:** decide which upstreams may control sampling; strip or restart untrusted trace context at the edge, or configure an appropriate ingress sampling policy while preserving trusted internal traces. Add collector limits and volume alerts. Do not silently destroy all legitimate distributed trace continuity.

### M05 — Realtime registry cleanup retains empty user entries

**Severity: MEDIUM. Placement: should fix in core realtime cleanup. Evidence: runtime reproduction.**

`realtime-connection.registry.ts` creates map entries before capacity checks. Tenant-wide disconnection removes sockets from alias sets without consistently removing empty keys. Subsequent removal methods delete a key only when deleting the socket succeeds.

The probe registered a socket and its alias, disconnected its tenant, then ran ordinary cleanup. Connection count was zero while user count remained one. Repeated unique users/rejected connections can retain empty entries and distort metrics. The WeakSet correctly prevents double counter decrements; retain that fix.

**Fix:** create entries only after admission, prune empty sets regardless of whether the socket was already removed, and test repeated tenant purge and rejection cycles.

### M06 — Browser CI does not provision all dependencies its tests use

**Severity: MEDIUM. Placement: should fix in core test infrastructure.**

`.github/workflows/ci.yml` provisions PostgreSQL, Redis and Mailpit and sets `S3_ENDPOINT=http://localhost:9000`, but does not provision/init MinIO. `apps/web/e2e/auth-and-notes.spec.ts:31` performs an actual upload. API E2E test containers provision PostgreSQL and Redis only.

The checked-in browser configuration also uses the development web server, not the production server behind Nginx. It cannot catch H01. Local `reuseExistingServer` can accidentally depend on a developer's existing environment.

**Fix:** provide isolated, initialized object storage for file E2E tests; isolate test services/data and add a separate production-proxy browser smoke test. Add two-tab refresh, worker restart, consumer failure and slow-SSE regression scenarios. This audit did not claim a fresh pass of the complete browser suite.

### M07 — Documentation and mandatory AI instructions disagree with the implementation

**Severity: MEDIUM. Placement: must fix in the starter's engineering contract.**

Verified examples:

| Source                                                 | Drift                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVENT_AND_ERROR_RULES.md:215`                         | Blanket catch-and-log listener guidance conflicts with reliable delivery; see H04.                                                                         |
| `FILE_PLACEMENT_RULES.md:281` vs `MODULE_RULES.md:191` | One permits modifying the pre-production baseline; the other requires new immutable migrations. The repository now has seven frozen migrations.            |
| `FILE_PLACEMENT_RULES.md:346`                          | Describes web credentials persisted to localStorage; actual web persistence stores user metadata only.                                                     |
| `docs/PRODUCTION_ARCHITECTURE.md:181` vs `:221`        | Earlier request-pipeline prose still attributes transaction setup to interceptors; later prose correctly describes explicit command/repository boundaries. |
| `docs/PRODUCTION_ARCHITECTURE.md:234`                  | Says the relay marks PUBLISHED after enqueue; current worker marks it after consumption.                                                                   |
| `docs/adr/0061-single-react-via-overrides.md`          | Claims react/react-dom are forced to one version; workspace overrides pin their types, while web/mobile have separate framework-compatible React versions. |
| `docs/adr/0042-hybrid-session-model.md`                | Claims offline account-version verification/fast stateless reads; the guard actually uses a fresh user lookup.                                             |

**Fix:** make operational behavior and migration policy unambiguous, update the placement map after reorganizations, and test selected documentation claims against actual config. Do not force React upgrades merely to match a stale ADR. Correct the ADR to the intended compatible runtime policy.

### M08 — Security override declarations do not match the resolved dependency graph

**Severity: MEDIUM. Placement: should fix in dependency management.**

`pnpm-workspace.yaml` declares patched versions for esbuild, uuid and decode-uri-component, but `pnpm-lock.yaml` contains only the root undici override and the audit still resolves affected versions. The root `package.json` also has a separate `pnpm.overrides` object. Treat the resolved lockfile and installed graph as evidence, not the presence of a declaration.

The current audit reports:

| Package/path                                                | Advisory severity | Relevant scope                                                                                       |
| ----------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| esbuild 0.18.20 through drizzle-kit                         | Moderate          | Development server CORS; applicability depends on actually running the affected serve functionality. |
| esbuild 0.27.7 through authorization/tsup                   | Low               | Windows development-server file traversal; not evidence that the deployed API exposes it.            |
| uuid 7.0.3 through Expo config/xcode                        | Moderate          | Buffer bounds behavior in particular UUID APIs; tooling path, exploitability not established here.   |
| decode-uri-component 0.2.2 through expo-router/query-string | Moderate          | Malformed percent-decoding CPU exhaustion; requires reachability/input review for mobile links.      |

**Fix:** consolidate override ownership, resolve the intended dependency graph and verify `pnpm why` plus a fresh audit. Check transitive compatibility before forcing major replacements. The frozen manifest/lockfile metadata check passed, so this report does not claim installation is currently blocked.

### M09 — Architectural enforcement is narrower than “full Clean Architecture and tactical DDD”

**Severity: MEDIUM for long-term reuse; not a demand for a rewrite. Placement: should clarify and selectively improve the core.**

Application commands import concrete repositories from their own infrastructure layer and use DatabaseService directly. The dependency rules allow this. Repository implementations contain substantial `as unknown as` query-shape casting, reducing the protection offered by strict TypeScript. Many dependencies have optional/fallback branches that production wiring does not need.

`docs/adr/0008-lite-ddd-cqrs-modules.md` explicitly describes Lite DDD and CQRS by use-case separation, not full aggregate-based tactical DDD or separate read/write stores. That is a defensible starter choice. It should be described accurately.

**Fix:** retain the module structure. Use real repository types and test doubles, require correctness-critical production dependencies, and introduce ports where meaningful substitution or domain isolation is needed. Add aggregates/invariants within complex future business domains; do not generate empty aggregates or interfaces for every CRUD table.

### M10 — Disabling the reference module is not a complete removal workflow

**Severity: MEDIUM for starter reuse. Placement: should fix in project initialization/tooling.**

`app.module.ts:57` conditionally registers Notes, which is good. But `scripts/prune-examples.js` primarily changes feature flags, its reported web/mobile paths do not match the current route structure, and Notes remains in shared query keys, contracts, source, migration assertions and test fixtures.

**Fix:** distinguish disable from remove in names and documentation. Correct status paths and provide a tested initialization/removal checklist covering registrations, routes/navigation, client/contracts, feature tests, lifecycle registrations and schema verification. Preserve published migration history; disabling a module is not justification to rewrite deployed migrations. Do not claim Notes business logic currently contaminates the generic storage or privacy implementation—it largely does not.

### L01 — Web runtime image carries the build workspace

**Severity: LOW. Placement: deployment improvement.**

`apps/web/Dockerfile:30` copies the whole installer workspace, including build tooling, into the runtime image. This increases image size, scanning surface and pull/deploy time. Build and runtime are already separate stages and the runtime is non-root.

**Fix:** package the production runtime and necessary workspace outputs/dependencies only. Keep Node in the runtime because the server uses it. pnpm is a build/operations choice, not a requirement that the Docker host install Node or pnpm.

### L02 — Container build tooling differs from repository tooling

**Severity: LOW. Placement: developer/deployment consistency.**

Both Dockerfiles install Turbo 2.10.12 while the current repository resolves 2.11.2. Pin from one intended toolchain source and test it; there is no need to replace the toolchain for this reason.

### L03 — SSE's initial connected message is emitted before subscription

**Severity: LOW. Placement: realtime protocol cleanup.**

`realtime-sse.controller.ts:63` calls `subject.next` before returning the Observable to Nest. A plain Subject does not replay that event to the later subscriber. Emit connection acknowledgment on subscription if the protocol needs it, or remove the misleading emission. The adjacent comment about rejected tenants degrading to global scope is also stale: the implementation throws Forbidden.

## Architecture and folder organization

The current organization is suitable for a growing modular monolith. **There is no reason to flatten it, replace it with microservices, or reorganize the whole repository again.** Domain modules are the primary unit of change; application, domain, persistence and presentation are local to each module. Infrastructure is organized by capability. Frontend routes delegate into features and shared UI lives in a package.

Folder depth alone does not guarantee maintainability. At 100K–500K LOC, the main risks are shared-contract ownership, concrete cross-module application imports, a growing global infrastructure surface, and central event/permission registries that everyone edits. Address these with ownership and narrow interfaces as the corresponding domains grow.

Recommended rules:

- Keep files with the owning domain/feature; move something to shared only after it is genuinely shared.
- Preserve one-way module dependencies. Prefer published application APIs/contracts over arbitrary deep imports into another module's application folder.
- Keep `common` restricted to transport primitives and small truly shared utilities. Do not create a universal business-service folder.
- Split contracts and query keys by capability inside the existing packages before adding more packages.
- Do not create every possible layer subfolder for a feature that needs only one use case.
- Keep compatibility forwarding files temporary and document which path is canonical.
- Add domain-specific invariants, concurrency rules and transaction boundaries when building ERP/CRM modules; the starter cannot infer them.

## Capability placement and completeness

“Must have” means every generated production application needs the capability or its safe extension boundary. It does not mean every provider and business feature must run by default.

| Capability                                                                                  | Placement                                                             | Current state and remaining work                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configuration validation, environment separation, secrets integration boundary              | **Must have in the core**                                             | Substantial validation exists. Real secret distribution, rotation and deployment identity are environment-owned. Fix pooling/config drift.                                                 |
| Authentication, session lifecycle, password reset and verification                          | **Must have in the core**                                             | Implemented; fix origin and multi-tab behavior. Define account-wide versus device-specific revocation semantics explicitly.                                                                |
| Backend authorization, permissions, default deny and resource checks                        | **Must have in the core**                                             | Implemented. Preserve backend enforcement and resource-specific tests.                                                                                                                     |
| Tenant context, scope propagation and isolation rules                                       | **Must have in the core**                                             | Implemented for single/multi modes. Every future repository/job/cache key must join the same contract.                                                                                     |
| Organizations, invitations, membership management and switching                             | **Optional module/plugin**                                            | Supplied and wired. Useful SaaS module; allow small single-tenant projects to disable its product surface.                                                                                 |
| Dynamic custom roles, permission groups, branch/team hierarchy                              | **Optional module/plugin**                                            | Foundational roles/policies exist; no complete domain-neutral management product. Add only when the project needs it.                                                                      |
| ABAC/context policies                                                                       | **Should have in the core**                                           | Extension mechanism exists. Project attributes, relationships and policy administration remain project-owned.                                                                              |
| SSO/OIDC, MFA/passkeys, enterprise identity provisioning                                    | **Optional module/plugin**                                            | Not a completed capability in the reviewed module inventory. For some enterprise projects these become launch requirements.                                                                |
| Service-to-service identity and machine permissions                                         | **Optional module/plugin**                                            | User JWT permissions are not a complete workload-identity model. Add a separate principal/scopes contract when integrations require it.                                                    |
| Typed API contracts, validation, errors, pagination, request limits, OpenAPI/version policy | **Must have in the core**                                             | Implemented foundation. Keep REST/oRPC parity checked and define compatibility policy for published versions.                                                                              |
| CSRF, CORS, secure cookies and security headers                                             | **Must have in the core**                                             | Present; fix H01/H02. Parameterization/output escaping remain the real injection defenses.                                                                                                 |
| Database connection management, migrations, transaction policy and tenant-safe access       | **Must have in the core**                                             | Implemented and tested; repair optional pooler and lock authority. PostgreSQL specialization is acceptable.                                                                                |
| Repositories, optimistic concurrency and atomic updates                                     | **Should have in the core**                                           | Repositories and selected atomic operations exist. Supply a documented compare-and-swap/version pattern for business mutations; do not assume all updates are protected from lost updates. |
| HTTP idempotency and durable operation receipts                                             | **Should have in the core**                                           | Implemented; business effect idempotency must extend through workers/consumers.                                                                                                            |
| Cache abstraction, namespacing, TTL and size limits                                         | **Should have in the core**                                           | Implemented. Entry limits are not byte limits; keep payloads bounded. Redis remains an important production dependency.                                                                    |
| Reliable outbox and job execution contracts                                                 | **Should have in the core**                                           | Implemented but H04/H06 block the advertised reliability guarantee.                                                                                                                        |
| Scheduled work, retry, dead-letter and graceful worker shutdown                             | **Should have in the core**                                           | Present. Validate loss of ownership, crashes, backlog admission and shutdown under actual long-running work.                                                                               |
| Event ordering across a business aggregate                                                  | **Optional module/plugin**                                            | No universal ordering guarantee should be assumed. Apply sequence/version constraints where the business requires ordering.                                                                |
| File/object storage                                                                         | **Optional module/plugin**                                            | Supplied; fix H05 before using it. Storage IAM, egress policy and bucket lifecycle require deployment setup.                                                                               |
| Antivirus, OCR, media processing                                                            | **Optional module/plugin**                                            | Scanner integration exists; default magic-byte validation is not an antivirus service. OCR/media engines should remain optional.                                                           |
| Transactional email                                                                         | **Should have in the core**                                           | Provider boundary/templates exist and auth needs delivery. Verify recovery and provider idempotency where supported.                                                                       |
| Notification inbox, push and digests                                                        | **Optional module/plugin**                                            | Supplied. Durable intents are valuable; repair upstream event outcomes.                                                                                                                    |
| Realtime SSE/WebSocket                                                                      | **Optional module/plugin**                                            | Supplied; fix H08/M05. Durable state remains authoritative.                                                                                                                                |
| Structured logs, request/trace IDs, health, metrics and error boundary                      | **Must have in the core**                                             | Implemented. Fix inaccurate measurements and per-instance coverage.                                                                                                                        |
| Trace export, dashboards, alerts and runbooks                                               | **Should have in the core**                                           | Useful defaults exist; collector/backend hosting can be optional. Validate actual alert delivery and cost limits.                                                                          |
| Critical mutation auditing                                                                  | **Must have in the core**                                             | Transactional audit writes and restricted retention exist. Define which business actions require atomic audit.                                                                             |
| User activity feed and detailed read/access history                                         | **Optional module/plugin**                                            | Mutation auditing is not a full activity/access-history product. Select events based on privacy and operational needs.                                                                     |
| Privacy export/erasure orchestration and lifecycle contributors                             | **Should have in the core**                                           | Implemented. Project data inventory and retention decisions remain necessary.                                                                                                              |
| Legal holds, consent, immutable financial records and retention schedules                   | **Should NOT belong in the boilerplate as universal business policy** | Keep extension boundaries; implement domain/jurisdiction policy in the owning application.                                                                                                 |
| Backup/restore procedure and recovery verification                                          | **Must have in the core operational contract**                        | Scripts and CI verification exist. Production RPO/RTO, off-site copies, encryption, restore access and drills are deployment requirements.                                                 |
| Feature flags and incident intake switches                                                  | **Should have in the core**                                           | Present. Keep evaluation simple; a commercial experimentation platform is optional.                                                                                                        |
| Search engine/index synchronization                                                         | **Optional module/plugin**                                            | Add when database search is insufficient. No mandatory separate search cluster.                                                                                                            |
| Generic import/export framework                                                             | **Optional module/plugin**                                            | Privacy export is not ERP bulk import. Supply bounded jobs, validation and resumability for projects that need bulk data workflows.                                                        |
| Outbound/inbound webhooks and external integrations                                         | **Optional module/plugin**                                            | Needs its own signatures, retries, replay, versioning, idempotency and SSRF/egress controls when added.                                                                                    |
| Forms, tables, routing, theming, i18n, accessibility primitives                             | **Should have in the core frontend**                                  | Strong shared foundation. Hundreds of screens still require domain feature boundaries and actual accessibility review.                                                                     |
| Python intelligence/AI layer                                                                | **Optional module/plugin**                                            | No Python application is present in the current apps inventory. Do not make Python, model calls or GPU infrastructure mandatory.                                                           |
| Billing, accounting, inventory, CRM pipelines, approval rules                               | **Should NOT belong in the boilerplate**                              | These are project domain modules. Reuse technical primitives, not invented universal business models.                                                                                      |
| Microservices, service mesh, universal workflow engine, event sourcing everywhere           | **Should NOT belong in the boilerplate by default**                   | No current evidence justifies their mandatory complexity.                                                                                                                                  |

## Security, tenancy and data governance conclusions

The starter has a stronger security foundation than a typical generated CRUD project, but configuration and lifecycle behavior are still part of security. The highest-confidence security-related problems here are refresh integration, externally controlled trace sampling, and reliability/availability weaknesses; this audit did not demonstrate a cross-tenant data-read exploit or SQL injection.

Policies support roles, action permissions, resource ownership and context conditions. They do not automatically provide organization-specific custom-role administration, branch hierarchies, separation of duties or service credentials. Those should be explicit project/module choices. Super-admin access is an exceptional backend capability and should remain auditable; it should not be inferred from a frontend role label.

Logout increments account authVersion and revokes all refresh sessions. Refresh reuse revokes the affected refresh session, but access tokens contain no session ID and are checked against the account version. Therefore a session-only revocation is not equivalent to immediate invalidation of that session's issued access tokens. Decide whether that expiry window is acceptable before exposing per-device session controls or promising immediate theft-response invalidation.

Tenant-aware jobs must carry a validated tenant/system scope; neither a message payload nor a frontend-selected tenant is inherently trusted. Future domains need negative tests for list, get, modify, export, file download, caches, notifications and background effects. Database RLS protects against accidental missing predicates, but an application role with superuser/BYPASSRLS privileges defeats that protection.

Privacy lifecycle hooks are the right design for reuse. Preserve stable actor/entity identifiers where records must remain, while allowing owning modules to remove direct identifiers and subject-owned data. Whether a record may be retained or deleted is project policy. A generic audit-retention duration and a tombstone do not by themselves establish compliance or enforce legal holds. Restoring backups also needs a process to reapply completed erasures before restored data becomes accessible.

## Performance, memory and cloud cost

**There is no evidence here to promise a request-per-second figure or that AWS costs cannot spike.** Capacity depends on workload, dataset, hardware, replica count, database latency, hashing, file size and third-party behavior.

Useful existing controls include finite container resources/log rotation, bounded job batches and retries, file quotas, limited completed/failed job retention, stream limits, trace batching/sampling, cache entry limits, and incident feature flags. Keep these controls.

The remaining cost and capacity exposures are concrete:

- Slow SSE consumers can retain a growing event backlog; fix H08.
- Queue waiting/delayed work and pending database work are not bounded simply because completed jobs are trimmed. Define admission thresholds, per-tenant fairness, queue age SLOs and saturation behavior.
- Every API replica makes fresh account checks; each process has its own database pool. Budget connections across API replicas, workers, locks, migrations and administrative headroom. Raising `DB_MAX_POOL_SIZE` on every replica is not a scaling strategy.
- Every realtime replica receives the stream fanout. Dispatch cost scales with replicas and event rate even when only one replica owns the destination connection. That is an acceptable simple design at moderate scale, with a measurable future limit.
- INFO request logging scales directly with traffic. As an illustration, 500 requests/second at 1 KiB per request log is about 41 GiB/day of raw text before indexing or replication. This is arithmetic, not a measurement of this application.
- Loki permits 1 MiB/second ingestion and retains seven days; retention alone is not a small disk budget. At the configured rate ceiling that is roughly 591 GiB of raw admitted data over seven days, before compression/overheads. Actual usage varies. Tempo retains 24 hours, but time-based retention is also not a storage-cap guarantee.
- Parent-based trace sampling is not a hard traffic-cost ceiling; fix M04. Verify sensitive URLs/attributes are sanitized in traces as well as application logs.
- Presigned URLs can be reused during their validity. Logical file quotas do not directly bound S3 request charges, noncurrent versions, repeated downloads or network egress. Configure version lifecycle, download authorization/rates, provider limits and storage alerts.
- A single Redis deployment carries sessions, caching, locks, jobs and streams. It is a shared capacity/failure boundary. Select persistence, eviction and memory policy to protect durable work; validate exhaustion behavior. Do not assume arbitrary Redis Cluster compatibility for multi-key Lua scripts.

Before launch, measure a representative workload with authentication, tenant checks, writes, list queries, job production/consumption and file activity. Record p95/p99 latency, error rate, pool wait, event-loop lag, heap/RSS, Redis memory, backlog age and telemetry volume. Test a dependency outage and restart recovery. Add deployment maximum replica counts and cloud-side budget/anomaly alerts; budget alerts themselves are not a hard spending cap.

## Observability and dashboard assessment

The current grouping is clear and appropriately small. Grafana provisions six topic dashboards in a single `Platform` folder:

| Dashboard                      | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| API & Service Performance      | Request health, latency, errors and service behavior |
| Async Pipelines & Realtime     | Queues, outbox and realtime delivery                 |
| Database & Redis Observability | Persistence/cache infrastructure                     |
| Object Storage (Universal)     | Application/provider-independent storage behavior    |
| MinIO Cluster Internals        | Optional MinIO-specific infrastructure detail        |
| Telemetry Health & Capacity    | Monitoring-system health and capacity                |

**This is not a messy dashboard dump.** Separate universal storage from MinIO internals, as already done. A single Platform folder is fine for six dashboards; add product/business dashboards under an application folder later. Do not create more dashboards merely to increase the count.

For dependable 2 AM operations, complete M01–M04 and verify actual scrape coverage, representative panel data, alert delivery, log-to-trace links, tenant-safe incident data and failure drills. A valid dashboard JSON file cannot prove that a metric has correct units, every replica is scraped, or notifications reach an operator.

## Testing and release requirements

The test foundation is substantial. The most important missing evidence is integration at subsystem boundaries, not another hundred mocked unit tests.

Before v1.0:

1. Resolve H01–H03 and verify production-proxy navigation, supported origin configurations and multi-tab refresh.
2. Resolve H04 and prove partial consumer failure, duplicate delivery and restart recovery with real PostgreSQL/Redis.
3. Resolve H05 and verify concurrent confirmations plus transient S3/AV failure recovery.
4. Resolve H06/H07 or explicitly remove/disable the unsupported pooling mode. Test two replicas with asymmetric dependency access and lost locks.
5. Resolve H08/M05 with slow-reader and repeated connect/disconnect soak tests.
6. Correct metric semantics and test PromQL against replicated fixtures. Send a test alert through the intended production receiver.
7. Provision all browser E2E dependencies and run the complete isolated suite. Add a production configuration smoke test, not only Vite dev tests.
8. Reconcile the actual dependency graph and mandatory documentation. Keep regression checks for the fixed behavior.
9. Build and boot the exact production image digests, run migrations, perform an isolated restore, and exercise deployment rollback. Verify runtime credentials are restricted.
10. Run a representative load/soak test and define a supported deployment envelope, resource budget and recovery targets.

No existing test failure is being hidden here: the executed suites passed. The findings show why passing unit suites and static configuration checks are insufficient to certify the integrated deployment.

## Scorecard

Scores reflect this revision and the evidence gathered, not future potential. Missing optional product features do not automatically lower a score.

| Area                  | Score / 10 | Reason                                                                                                                                                 |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture          | 8          | Clear modules, explicit use cases and executable boundaries; dependency inversion is pragmatic rather than strict.                                     |
| Security              | 7          | Strong defenses and RLS; browser auth integration, availability risks and deployment verification remain.                                              |
| Authentication        | 7          | Good password/token fundamentals; cross-tab rotation and split-origin refresh need correction.                                                         |
| Authorization         | 8          | Backend enforcement, default deny, ownership/context policies and tenant constraints; enterprise policy administration is intentionally not universal. |
| Database              | 7.5        | Scoped transactions, migration lineage and tested RLS; pooler/session-lock compatibility and repository typing need work.                              |
| Scalability           | 6.5        | Separate workers, claims and bounded batches; lock authority, SSE pressure, shared Redis and per-replica monitoring limit confidence.                  |
| Reliability           | 6          | Consumer outcome loss and upload state races undermine otherwise good recovery primitives.                                                             |
| Performance           | 7          | Pagination, caching and resource limits exist; no sustained benchmark and some connection/telemetry inefficiencies remain.                             |
| Background jobs       | 7          | Retries, leases, dead letters and shutdown handling exist; failure ownership and admission require stronger verification.                              |
| Event architecture    | 6          | Transactional outbox/versioning are sound building blocks; required consumers can fail without triggering retry.                                       |
| Frontend architecture | 8          | Feature boundaries, typed client, state separation, tokens/i18n and route structure are reusable; production runtime integration is incomplete.        |
| API design            | 8          | Shared contracts, validation, consistent errors, OpenAPI and transport parity; business idempotency still must extend beyond HTTP.                     |
| Testing               | 7.5        | 1,284 unit tests and real API/RLS/migration checks passed; important browser/worker/failure interactions remain unproven.                              |
| Observability         | 7          | Useful end-to-end components, six coherent dashboards and runbooks; correctness and replica discovery need fixes.                                      |
| DevOps                | 6.5        | CI, immutable release artifacts and hardened containers; CSP and optional pooling reveal gaps in production boot verification.                         |
| Developer experience  | 8          | Doctor, bootstrap, initialization, generators, scripts and extensive guidance; conflicting instructions and example-removal paths create friction.     |
| Maintainability       | 7.5        | Good local ownership and tests; casts, optional fallbacks, global wiring and document drift need discipline.                                           |
| Reusability           | 8          | Notes is optional and major capabilities are generic; clean module removal/profile testing is unfinished.                                              |
| Extensibility         | 8          | Policies, lifecycle contributors, storage/email boundaries and use-case pattern support new domains without a platform rewrite.                        |
| Production readiness  | 6          | Multiple confirmed failures affect advertised deployment and reliability behavior. Release sign-off requires the gates above.                          |

## Recommended target architecture

Retain the existing stack and modular monolith. The work is mostly to finish contracts between subsystems and validate them under failure, not introduce replacement frameworks.

```text
apps/
  api/src/
    bootstrap/                 # process role, HTTP/worker startup and shutdown
    config/                    # validated configuration
    common/                    # small transport/context primitives
    modules/
      auth/ users/             # foundational identity capabilities
      tenancy/                 # optional organization product surface
      files/ notifications/    # optional supplied capabilities
      privacy/                 # lifecycle orchestration and contributor boundary
      <project-domain>/
        domain/                # entities, invariants, value objects, domain errors
        application/           # commands, queries, required consumer handlers
        infrastructure/        # module-owned schema/repositories/adapters
        presentation/          # REST/oRPC adapters
    infrastructure/
      database/ authorization/ session/ security/
      outbox/ queue/ idempotency/ lifecycle/
      cache/ redis/ storage/ email/ realtime/
      audit/ logger/ metrics/ tracing/ health/
  web/src/
    routes/                    # routing and thin composition
    features/<capability>/     # screens, forms, queries and feature UI
    components/                # application shell and truly shared components
    lib/                       # client, identity boundary, i18n and small adapters
    stores/                    # identity/UI state, not duplicate server state
  mobile/                      # optional app, same transport contracts
packages/
  contracts/                   # public schemas/events grouped by capability
  authorization/               # pure permission/policy evaluation
  api-client/                  # transports and platform-aware refresh coordination
  ui/ design-tokens/ i18n/ email/ typescript-config/
migrations/                    # immutable journal and operational hardening
docker/                        # tested deployment profiles and observability
scripts/                       # doctor, initialization, generation and verification
docs/                          # architecture, operations, runbooks and accurate ADRs
```

This is a target ownership map, not a request to rename working folders immediately.

**Core foundation:** identity/session correctness; authorization; tenant context; validated configuration; API contracts; database transaction/migration rules; audit and lifecycle boundaries; required-consumer semantics; idempotency; observability hooks; testing and deployment contracts.

**Optional/project-specific:** organization UI, files/scanning providers, notifications/push/digests, realtime, enterprise identity, external integrations/webhooks, search, bulk import, Python intelligence, and all ERP/CRM/workflow business domains.

Use a small, explicit application module composition/profile mechanism. Test both the minimal single-tenant profile and the fuller SaaS profile. Runtime third-party plugin loading is unnecessary. Keep one database and one deployment unit until measurements or ownership boundaries justify more.

For a new complex business module, define invariants and ownership first, then commands/queries, transaction boundaries, concurrency rules, backend policies, public contracts, event consumers and lifecycle contributions. Do not treat a generated folder tree as enforcement of accounting or workflow correctness.

## Direct answers

1. **Is it a good general-purpose starter?** Yes. It has substantial reusable engineering and real boundary enforcement.
2. **Would I start a serious project on it?** Yes for development, with the release remediation tracked immediately. No to launching this exact revision unchanged.
3. **What is most missing?** Proven integration and failure behavior: production browser boot, cross-origin/multi-tab auth, reliable consumers, safe scanning, one lock authority, bounded SSE and replicated observability.
4. **What are the biggest architectural risks?** Advertising stronger guarantees than the consumer/worker implementations deliver; shared global infrastructure becoming a dependency hub; domain growth without explicit invariants.
5. **What must precede v1.0?** The ten release requirements above, particularly all HIGH findings.
6. **What should not be added?** Mandatory microservices, an AI runtime for every application, a generic ERP schema, universal workflow engine, event sourcing everywhere or abstractions created only to fill folders.
7. **What will hurt at large scale?** Shared database/Redis contention, expensive per-request checks without measured sizing, global edit hotspots, slow-consumer memory and incomplete per-replica monitoring.
8. **What belongs in reusable core infrastructure?** Trust/context, safe transaction/event execution, identity and authorization, contracts, idempotency, bounded I/O, observability and executable engineering rules.
9. **What should be optional?** Product capability modules and their providers: organizations, files, notifications, realtime, enterprise auth, search/integrations and intelligence.
10. **What should be redesigned now?** Refresh coordination, durable consumer outcomes/idempotency, the file scanning state machine and distributed lock authority. Preserve the overall module structure.

**You are close enough to stop reinventing the overall application architecture for each project. You are not yet at the point where the starter's existing wiring can be assumed safe without these corrections and deployment-specific verification.**
