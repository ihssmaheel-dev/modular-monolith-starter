# Starter remediation plan — 22 September 2026

Status: implementation substantially complete; verification results and open release gates are tracked in [Starter release verification](STARTER_RELEASE_VERIFICATION.md).

Source: Architecture starter re-audit, revision `74deb0d`.

## Objective and scope

Complete every open or partial finding from the re-audit, preserve the verified fixes, and produce repeatable release evidence. Keep the current modular monolith, CQRS use cases, domain boundaries, contracts, localization, PostgreSQL/Drizzle, Redis/BullMQ, and frontend stack.

The target is a reusable application starter. Notes is an example used to verify the extension pattern, not the product being optimized.

This plan names existing files and proposed new files separately. New paths are implementation destinations, not claims that those files already exist. Additional imports, barrel exports, and directly affected tests may need small updates; they should remain in the same change as their owning capability.

### Current work to preserve

At planning time, these application changes already exist in the working tree:

- Modified: `apps/web/src/routes/__root.tsx`.
- Modified: `apps/web/vite.config.ts`.
- Untracked: `apps/web/src/server.ts`.

They appear to be work on H01. Incorporate them deliberately when implementation begins. The current custom handler sets a nonce after router initialization and modifies private `serverSsr.hydrationScripts` fields. Replace that private-field dependency with the supported early router SSR nonce path described in P2. Do not overwrite or reset the work as part of starting a branch.

The existing audit report is also untracked. This planning task does not change application code, branches, or dependencies.

## Design decisions

1. **The SSR application owns its HTML CSP and nonce.** Generate the nonce before hydration machinery is initialized; Nginx forwards that policy. Keep other proxy security headers. A request ID is for correlation, not the application nonce contract.
2. **Durable handlers have explicit identities and outcomes.** Separate required outbox consumers from best-effort local observers. Keep the existing outbox and queue; add only the small registration/execution boundary needed to make outcomes unambiguous.
3. **Idempotency belongs beside the effect.** Reuse operation receipts for atomic database effects. Persist delivery intent before external work. Do not claim exactly-once SMTP delivery, which the transport cannot guarantee.
4. **One file scan claim protocol.** Confirmation accepts verified upload metadata; only the worker owns scanning/promotion. All terminal database transitions are conditional on the current claim. Storage side effects must also be safe if a lease expires.
5. **SSE limits measure writes and bytes.** Replace the microtask counter with a transport-aware bounded writer. Keep authentication, tenant checks, connection limits, and expiry behavior.
6. **Direct PostgreSQL remains the default.** Complete and verify PgBouncer as an optional encrypted deployment; it does not become a mandatory service.
7. **Same-origin web/API remains the default.** Finish the advertised cookie-domain opt-in with explicit configuration and tests; do not broaden default cookie scope.
8. **Keep the existing folder structure.** Add focused files at actual capability boundaries. Do not introduce microservices, a new event platform, a generic plugin framework, or empty interfaces/aggregates throughout the repository.

## Work order and coverage

Each row is a work package, not necessarily one large PR. Split large changes into schema, implementation, and integration commits that remain reviewable.

| Package | Work                                                  | Audit coverage                              | Depends on                               |
| ------- | ----------------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| P0      | Preserve work and establish release baseline          | All                                         | —                                        |
| P1      | Isolated production test environment                  | M06                                         | P0                                       |
| P2      | Supported SSR nonce and production CSP                | H01                                         | P1                                       |
| P3      | Durable outcomes and effect idempotency               | H04                                         | P1                                       |
| P4      | File scan state machine and client completion         | H05                                         | P1; coordinate migration numbers with P3 |
| P5      | Bounded SSE transport and resynchronization           | H08; retain M05/L03 fixes                   | P1                                       |
| P6      | Bounded refresh and cookie configuration              | H02/H03 residuals, M12, M13                 | P1/P2                                    |
| P7      | Database/pooler safety and query instrumentation      | H07, part of M02; retain H06 fix            | P1                                       |
| P8      | Correct metrics, dashboards, and cost signals         | M01, M02, M03; retain M04                   | P3–P7 metric contracts                   |
| P9      | Runtime/image/release maintenance                     | M11, L01, L02, L04                          | P1; final image checks after P2–P8       |
| P10     | Architecture rules, documentation, and initialization | M07, M09, M10                               | Correct behavior established by P2–P9    |
| P11     | Complete release verification and closure ledger      | All, including previously resolved findings | P1–P10                                   |

Documentation should change with each implementation package. P10 is the final cross-document reconciliation, not permission to leave misleading instructions in place until the end.

## P0 — Baseline and safe implementation workflow

**Changes:** begin implementation on a dedicated branch such as `fix/starter-release-hardening`, preserving the user's current uncommitted work. Do not create or switch the branch during this planning task. Record the starting revision, dirty paths, runtime versions, and the exact supported deployment combinations.

**Files:** this plan and the audit report; later, a new `docs/STARTER_RELEASE_VERIFICATION.md` containing the tested commit, image digests, check results, and remaining limitations.

**Completion:** every audit ID maps to a work package and a behavioral acceptance test. Preserve the old audit as a historical finding record; update a closure ledger rather than rewriting history as if the old defects never existed.

## P1 — Build the test environment that can prove the fixes

**Modify** `.github/workflows/ci.yml`, `apps/web/playwright.config.ts`, root `package.json`, and `apps/web/package.json`.

**Add** `docker/docker-compose.test.yml`, `scripts/test-environment.js`, `apps/web/playwright.production.config.ts`, and focused specs under the existing `apps/web/e2e/` directory. Use the current Docker images, Vitest, Playwright, and Node APIs; no replacement test framework.

**Implementation:**

1. Provision isolated PostgreSQL, Redis, MinIO, bucket initialization/CORS, Mailpit, API, worker, built web, and Nginx as needed by the test profile. Reuse the production Nginx configuration rather than copying a policy into a test-only proxy and allowing it to drift.
2. Generate local test certificates outside tracked source. Run browser security tests over HTTPS with named test origins; test-only trust configuration must not become a production TLS bypass.
3. Use a unique Compose project, no fixed container names, distinct ports, disposable test volumes, and explicit test database URLs. Never reuse the developer's active API/database for this suite.
4. Separate normal development-server browser tests from production-output tests. CI must set `reuseExistingServer: false` and run upload flows against initialized object storage.
5. Make scripts cross-platform: resolve paths from the repository root, propagate child-process failure, use bounded readiness waits, capture logs on failure, and remove only resources created for this test run.
6. Add proposed commands `test:production`, `test:pooler`, and `test:release` only when their implementation exists. Keep the fast unit lane separate from container/browser integration lanes.

**Completion:** a fresh CI machine can perform register/login/refresh, upload/scan/attach/download, and a worker-driven notification through the actual built application. A missing bucket, stopped worker, or broken CSP causes a meaningful test failure rather than a skip.

## P2 — Fix CSP using the public TanStack SSR contract

**Modify existing/in-progress files:**

| File                                              | Change                                                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/router.tsx`                         | Generate a cryptographically random nonce on the server and pass it through `createRouter({ ssr: { nonce } })` before SSR utilities attach. Keep server QueryClients isolated.               |
| `apps/web/src/routes/__root.tsx`                  | Read the nonce through the supported SSR/router API; apply it to the theme initializer; emit the matching document CSP through the route's supported headers mechanism. Keep the route thin. |
| `apps/web/src/server.ts`                          | Simplify the in-progress custom entry. Remove private hydration-field mutation. Retain only necessary public server-entry/header behavior.                                                   |
| `apps/web/vite.config.ts`                         | Keep custom server entry wiring only if the finished implementation needs it.                                                                                                                |
| `docker/nginx.conf`, `docker/nginx-insecure.conf` | Stop imposing a second, mismatched document CSP. Forward the web response policy and keep appropriate proxy security headers and API/static/error-response policy.                           |
| `docs/FRONTEND.md`, `docs/PRODUCTION_OPS.md`      | Document CSP ownership, cache behavior, and the supported deployment path.                                                                                                                   |

**Add** `apps/web/src/lib/security/csp.ts` for a small policy builder if needed, its co-located test, and `apps/web/e2e/production-csp.spec.ts`.

The installed router supports an SSR nonce, and the upstream CSP fixture initializes it during router creation and reads it in root-route headers. Follow that public contract, checking the installed types, instead of patching framework internals. [TanStack CSP router example](https://raw.githubusercontent.com/TanStack/router/main/e2e/react-start/csp/src/router.tsx), [root-route policy example](https://raw.githubusercontent.com/TanStack/router/main/e2e/react-start/csp/src/routes/__root.tsx).

**Requirements:** fresh nonce per HTML response; no client-supplied nonce; no global mutable nonce; header and every required bootstrap script agree; no permissive `unsafe-inline` addition to script policy. Retain currently necessary style behavior separately. Do not cache authenticated HTML or reuse a per-response nonce through shared HTML caching; immutable assets remain cacheable.

**Tests:** direct `/auth`, authenticated deep link, route navigation, form interaction, lazy route loading, theme bootstrap, and rendered error page under production headers. Capture CSP violations and page errors. Assert two documents have different nonces, valid scripts run, an unapproved inline script is blocked, and Nginx does not add a conflicting second policy.

## P3 — Complete durable delivery and effect idempotency

### P3a: required consumer execution

**Modify** `apps/api/src/infrastructure/outbox/outbox.module.ts`, `index.ts`, `workers/outbox-event.worker.ts`, its tests, and `workers/event-consumer-idempotency.test.ts`.

**Add** `apps/api/src/infrastructure/outbox/services/outbox-consumer.registry.ts` and its test. Keep the private consumer types with this capability. Existing public event envelopes remain in `packages/contracts/src/schemas/outbox.schema.ts`; do not move runtime registration types into public API contracts.

The registry should contain stable consumer IDs, subscribed topics, and typed `Result`-returning handlers. Modules register their own handlers; the infrastructure registry never imports domain modules. Invoke required handlers directly through this boundary so Nest's ordinary event exception suppression cannot turn failure into success. Catch unexpected exceptions at the infrastructure runner and turn them into retryable queue failures. An invalid/missing required outcome is failure, not implicit success. Reject duplicate registrations at startup.

Keep EventEmitter2 for explicitly classified local observers. Decide each current listener's category, including users, tenancy, notification fan-out, Notes realtime, membership cleanup, and realtime revocation. A durable event with no required consumers needs an explicit observer-only classification; do not silently acknowledge a misspelled or unregistered required topic. Preserve trusted tenant/system scope and check Results from publication/receipt state changes.

**Modify owning registrations and handlers:**

- `apps/api/src/modules/users/users.module.ts` and `application/listeners/welcome-email.listener.ts`.
- `apps/api/src/modules/tenancy/tenancy.module.ts`, `application/listeners/invitation-email.listener.ts`, and `membership-user.listener.ts` where its classification requires it.
- `apps/api/src/modules/notifications/notifications.module.ts` and `application/listeners/domain-event-fanout.listener.ts`.
- Relevant listeners/registration in Notes and realtime only after the classification inventory; best-effort hint handlers need not become required database work.

The invitation email listener currently returns `void` and logs a failed send. Include it in this work; fixing only the welcome listener would leave the delivery contract incomplete. Convert lookup failures to errors; intentional recipient-absent or preferences-disabled outcomes should be typed no-ops with a reason.

### P3b: deduplication beside database and external effects

**Modify** `modules/notifications/application/commands/send-notification.command.ts`, its test, and, as needed, `infrastructure/repositories/notifications.repository.ts` and `infrastructure/schemas/notification.schema.ts` under that module. Add a small `application/services/notification-event-handler.service.ts` if transaction orchestration would otherwise enlarge the listener/command excessively.

Reuse `infrastructure/idempotency/operation-receipt.service.ts` and `repositories/operation-receipt.repository.ts`. For each database effect, use a stable identity such as `(consumer version, tenant/global scope, source event, recipient/effect)`. Claim, notification/batch/intents writes, and receipt completion must commit in the **same short transaction**. Replaying a completed effect returns its previous outcome without creating a second row or appending twice to a digest batch. Do not wrap provider calls in that transaction.

Define deduplication retention against the actual retry and supported manual-replay horizon. The current seven-day generic receipt default must not silently weaken a longer event replay promise. Either retain an effect receipt until the source event is no longer replayable, or enforce a bounded replay window and retain receipts beyond it. Clean up in batches. Do not promise indefinite deduplication while deleting the evidence needed to perform it.

For welcome/invitation emails, persist a delivery intent atomically with the consumer receipt; let the existing queue/worker adapters perform the external send. A minimal email intent repository/schema under `infrastructure/email/` is appropriate if existing notification intents cannot represent these identity/security emails without coupling the modules. Preserve template/localization ownership in users/tenancy.

**Files for that bounded extension:** `infrastructure/email/email.module.ts`, `workers/email-queue.worker.ts`, `email.service.ts`, `email.types.ts`; proposed `schemas/email-delivery.schema.ts`, `repositories/email-delivery.repository.ts`, and `workers/email-delivery-relay.worker.ts`. Update `apps/api/drizzle.config.ts` if the new infrastructure schema is introduced.

Remove inline-send fallback from required durable consumers: a queue outage leaves the delivery intent pending. Pass a stable operation ID to provider adapters and preserve retry limits/backoff. SMTP still has an ambiguous “provider accepted, local acknowledgement lost” window; expose/document it and do not claim exactly-once external delivery. Queue acceptance, event-consumer completion, and final provider delivery are separate observable states.

**Tests:** real Nest/module wiring, thrown renderer exception, returned failure, queue unavailable, partial consumer success, crash before/after database commit, two workers, replay after Redis loss, receipt expiry/replay boundary, and dead-letter replay. Assert one database effect and durable intent; assert external retry behavior according to the provider's actual idempotency capability.

## P4 — Give file scanning one owner and safe recovery

**Modify:**

| Files                                                                                                                                     | Change                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/files/application/commands/confirm-upload.command.ts`                                                               | Remove direct `scanOne()` execution; atomically move pending to scan-eligible state; return current metadata on a valid repeat confirmation. Preserve ownership and tenant checks. |
| `application/workers/file-scan.worker.ts` under files                                                                                     | Claim work through one repository protocol; bounded attempts/backoff; separate unavailable storage/scanner from proven invalid content.                                            |
| `infrastructure/repositories/files.repository.ts` under files                                                                             | Add compare-and-set claim, renewal, completion, and failure operations; require claim token and expected state; never allow a stale completion to overwrite a winner.              |
| `infrastructure/schemas/file.schema.ts` under files                                                                                       | Add private claim token/lease expiry, attempts, next attempt, safe failure code, and promotion identity/key metadata needed for recovery. Index due work.                          |
| `domain/entities/file.entity.ts`, `domain/errors/file.errors.ts`, `presentation/mappers/files.mapper.ts` under files                      | Map private persistence state deliberately; public responses expose status, not claim tokens or internal storage metadata.                                                         |
| `application/workers/file-cleanup.worker.ts`, `file-reconciliation.worker.ts`, `application/services/file-objects.service.ts` under files | Respect active leases and winning object identity; reclaim abandoned artifacts with bounded work.                                                                                  |
| File download, delete, user/tenant purge commands/queries under files                                                                     | Resolve the committed object key correctly after promotion changes.                                                                                                                |
| `apps/api/src/infrastructure/storage/storage.service.ts`, `storage.types.ts`, `drivers/s3.driver.ts`, `scanner/file-scanner.service.ts`   | Preserve provider error classification and immutable source/version checks; bound and abort external work as required.                                                             |
| `apps/api/src/modules/files/files.module.ts`                                                                                              | Adjust providers/constructor dependencies after separating confirmation and scanning.                                                                                              |

Proposed worker helpers belong in `modules/files/application/services/`, for example `file-promotion.service.ts`. Private persistence mapping/SQL stays in the owning repository. Keep new retry/lease settings in the validated environment contract with documented bounds.

**State contract:** pending → uploading/eligible → scanning → uploaded, or retryable scanning failure → eligible, or confirmed rejection/exhaustion → failed. Existing public statuses can remain; attempts, retry deadlines, and lease state need not become new public enums.

**Storage correctness:** a database claim alone does not fence an S3 request already in flight. Use immutable promotion candidates tied to a claim/source identity, and atomically select the verified winner in the database. Persist the winning storage key separately from the stable logical upload key if necessary. A losing/stale attempt may clean only its own unreferenced candidate; it must never overwrite or delete the winning object. Track and reclaim abandoned candidates so this fix does not introduce unlimited orphan storage. Reuse existing conditional/version-aware source copy checks.

On a transient source or promoted-object metadata error, retain recoverable bytes and retry. On a database commit failure after copy, retain enough identity to verify/recover the candidate. Missing quarantine after another attempt completed is not corruption. Check every repository Result before reporting success.

### Update the client flow in the same work package

Removing the inline scan changes observable timing. The current web attachment flow retries only briefly, and mobile attempts attachment immediately. Backend-only changes would leave a broken user flow.

**Modify** `packages/api-client/src/subclients/upload.ts`, `subclients/files.ts`, and their tests; `apps/web/src/features/files/files.mutations.ts`, `files.queries.ts`, file-upload components; `apps/mobile/src/features/files/files.mutations.ts`; and `packages/i18n/src/locales/{en,es,fr}.json`.

Keep confirmation's existing 200 metadata response unless a deliberate contract change is needed. Treat `uploading/scanning` as processing. Put bounded, cancellable status polling in the shared client/helper, with backoff and a total deadline, and show a resumable processing state if that deadline elapses. Resume checking the same file ID; do not upload another copy. Attachment/download wait for `uploaded`. Set worker scheduling and client deadlines together, with a documented worst-case scan delay. Avoid repeated attachment mutations as the polling mechanism.

**Tests:** concurrent confirms, confirm/cron overlap, two scan workers, lease expiry, worker kill after copy, old owner completing late, source overwrite attempt, transient metadata/scanner failure, DB failure, retry exhaustion, deletion during scanning, tenant isolation, and successful web/mobile completion. Assert neither active nor abandoned storage grows beyond the documented lifecycle bounds.

## P5 — Replace the SSE counter with a bounded transport writer

**Modify** `apps/api/src/infrastructure/realtime/transports/realtime-sse.controller.ts`, `connections/realtime-connection.registry.ts`, `connections/realtime-connection.dispatcher.ts`, `realtime.service.ts`, their tests, and the relevant Nginx SSE location.

**Add** `apps/api/src/infrastructure/realtime/transports/sse-connection.ts` with a small private writer contract and `sse-connection.test.ts`. Add `realtime-sse.controller.e2e.test.ts` beside the controller; a real socket client is required for the backpressure scenario, even though ordinary route tests use Fastify inject.

Use an explicit Fastify response stream/writer for SSE so the application controls `write()`/`drain` and queue ownership, instead of feeding an unbounded framework Observable queue. Stop writes when the stream returns false. Bound pending bytes, event count, maximum event size, and stalled-drain time. Count the already-buffered response bytes as part of the budget, not just the application array.

Keep one registry entry per physical connection with tenant/global aliases. Retain guard execution, membership checks/revalidation, access-token expiry, admission limits, initial connected notification, and disconnect cleanup. Ensure timers, listeners, and counters are released on disconnect, expiry, shutdown, overflow, and rejected admission. Configure proxy buffering/compression appropriately for SSE.

**Client recovery:** update `apps/web/src/hooks/use-realtime-notifications.ts` and its test to refetch durable notification state on reconnect/open and on `sync_required`. Never rely solely on a resync event being delivered into a blocked socket. Avoid reconnect loops after logout and preserve tenant/user cache isolation.

**Initial budgeting:** select per-connection and process-wide byte caps together. For example, even 64 KiB times 5,000 connections is roughly 320 MiB before socket/runtime overhead. Treat this as sizing arithmetic, not a proposed safe default. Derive defaults from the supported API memory budget and validate with the slow-client test.

**Tests:** block a real client reader; publish across many event-loop turns; assert queue bytes remain below the cap and the client disconnects by the drain deadline. Test large events, repeated reconnects, tenant revocation, server shutdown, and cleanup to baseline. Assert healthy clients remain responsive during the slow-client test.

## P6 — Finish refresh coordination and cookie deployment support

**Modify** `packages/api-client/src/utils.ts`, `types.ts`, `index.ts`, `orpc.ts`, and `apps/web/src/lib/api.ts`. Split refresh logic into a proposed `packages/api-client/src/auth/refresh-coordinator.ts` if needed to keep the current utility file focused; test it there. Update `apps/web/src/lib/cross-tab/auth-sync.ts` and its tests.

Use a typed refresh outcome distinguishing successful rotation, invalid session, retryable network/server failure, and unsupported coordination. Apply a request deadline with AbortController and a separate deadline to pending lock acquisition. Cancel timers and release lock ownership on every completion path. Web Locks supports aborting a queued acquisition; the acquired callback also needs its own bounded fetch. [Web Locks request API](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request).

Publish/adopt the refreshed state before releasing the lock, and re-check identity/token generation after acquiring it so a waiting tab can use a result already received rather than rotating needlessly. Prevent stale refresh completion from restoring a session after logout or an identity switch. Keep browser refresh cookie-first/cookie-only at the client; retain explicit refresh-token transport for mobile.

Do not add a best-effort localStorage lock and call it safe coordination. The default browser support contract should require HTTPS and Web Locks for automatic cross-tab refresh. If unavailable, return a controlled reauthentication/unsupported outcome instead of silently claiming concurrency safety. Mobile uses its explicitly selected in-process coordinator. A legacy-browser coordinator can be added later only with its own race/failure tests.

Both REST and oRPC must consume the same outcome logic. A temporary timeout should not automatically broadcast permanent logout to every tab. Bound retries, preserve actual replay rejection, and document that an interrupted token rotation can have an ambiguous server outcome; never replay an old body token indefinitely to conceal that condition.

**Cookie files:** `packages/contracts/src/schemas/env.schema.ts`, `env.production.ts`; `apps/api/src/main.ts`; `apps/api/src/modules/auth/presentation/helpers/auth.cookies.ts`; `docker/docker-compose.prod.yml`, `docker/.env.prod.example`; `docs/ENVIRONMENT.md`, `docs/PRODUCTION_OPS.md`.

Keep host-only defaults. Forward optional `COOKIE_DOMAIN` in Compose; normalize empty values to undefined; validate cookie-domain syntax and its intended relationship to configured API/client hosts; preserve the same domain/path when clearing cookies. Document that parent-domain cookies require trusted sibling subdomains. Test the opt-in with distinct HTTPS hostnames, not localhost ports. Keep the default same-origin example and CORS/origin enforcement.

**Tests:** sequential/simultaneous refresh in two tabs, stale tab, stalled fetch, queued-lock deadline, holder closure, logout while refresh runs, user switch, unavailable Web Locks, mobile explicit-token refresh, wrong CSRF, cross-domain cookie clearing, and genuine stolen-token replay.

## P7 — Complete the optional pooler and database instrumentation

**Modify** `docker/pgbouncer-entrypoint.sh`, `docker/docker-compose.prod.yml`, `docker/docker-compose.staging.yml`, their environment examples; `packages/contracts/src/schemas/env.schema.ts`/`env.production.ts`; `apps/api/src/infrastructure/database/connection/database-pool.ts`, `transactions/transaction-context.ts`, `database.service.ts`; `docs/DATABASE.md`, `docs/PRODUCTION_OPS.md`.

1. Configure both TLS legs: application → PgBouncer and PgBouncer → PostgreSQL, with certificate/key/CA mounts, verification modes, and hostname verification appropriate to each endpoint. The production profile must fail clearly when required material is missing. Add the equivalent setup to the isolated test profile.
2. Preserve the **existing** transaction-local timeout and tenant `set_config(..., true)` calls in `transaction-context.ts`; they are already implemented. Remove reliance on connection-hook session `SET` for pooled correctness. Apply nontransactional baseline timeouts using verified database/role defaults or a documented safe connection path, including health/tooling queries. A client `query_timeout` alone is not a substitute for server cancellation policy.
3. Correct documentation: transaction pooling does not normally run `server_reset_query`, and application sessions cannot depend on a stable backend connection. [PgBouncer configuration reference](https://www.pgbouncer.org/config).
4. Keep Redis as the single runtime worker lock authority in standard wiring and fail closed on outage. Remove the unused provider-absent worker fallback if tests can inject a proper lock adapter; keep migration advisory locking on the direct connection. If a PostgreSQL runtime fallback is retained, it needs an explicit adapter with dedicated direct connection, loss detection, and tested fencing—not automatic fallback during a Redis outage.
5. Instrument checked-out `PoolClient.query` as well as pool-level use without double counting. Preserve all promise/callback overload behavior; install instrumentation once per physical client. Keep SQL values, credentials, and raw sensitive query text out of logs. Use hashes and bounded labels.

**Add** `connection/database-pool.integration.test.ts`, `transactions/transaction-context.integration.test.ts`, and focused pooler integration coverage; keep tests co-located with the owning implementation.

**Tests:** encrypted direct and pooler connections, untrusted certificate rejection, two tenants repeatedly reusing one pooler server connection, local timeout reset, statement/lock/idle timeout behavior, cancelled query, pooler restart, Redis lock outage, and observable slow transaction queries. Migrations continue using `DB_DIRECT_URL`.

## P8 — Finish observability correctness and cost signals

**Modify** `apps/api/src/infrastructure/metrics/metrics.service.ts` and its tests; `queue/queue.service.ts` and tests; `docker/observability/prometheus/{prometheus.prod.yml,alerts.yml}`; affected Grafana dashboard JSON; `scripts/validate-observability-config.js`; relevant runbooks.

**Add** `docker/observability/prometheus/tests/alerts.test.yml` for `promtool test rules` fixtures and wire the command into CI. Tests validate alert semantics, not merely YAML formatting.

**Required changes:**

- Identify metrics by actual registered type and a stable label signature. Distinguish an existing empty label set from missing metadata. Reject histogram/summary conflicts. Use real prom-client objects in adapter tests and verify telemetry errors do not replace the application's original result.
- Set queue span `ERROR` status on failed jobs, as well as recording the exception. Preserve finally-based span closure, trace propagation, and retry behavior.
- Keep ascending oldest-job reads and explicit millisecond histogram buckets already fixed.
- Discover actual API/worker instances. Document that DNS A discovery is suitable only when the deployment returns replica addresses, not a single service VIP. Test the supported Compose discovery and document platform-specific adapters separately.
- Label/group CPU and related container queries by deployment/project plus service, or per instance. Exclude zero/negative quotas from percentage-of-quota alerts; represent unlimited containers with a separate appropriate usage signal. Do not merge two projects' identically named services.
- Preserve the six existing dashboard categories. Add project/instance selectors only where meaningful, verify runbook links and units, and conditionally provision MinIO-specific panels/profile when that provider is used.
- Add low-cardinality signals for SSE queued bytes/disconnect reasons, file retry age/attempt exhaustion, required consumer failures/deduplicated effects, and actual provider delivery outcomes. Never label every metric with user, file, event, email, or arbitrary tenant IDs.
- Preserve retention, sampled/batched export, stream/sample limits, container resource limits, and log rotation. Keep untrusted trace context policy and test it. Make validator output state what was actually validated rather than claiming blanket production safety.

**Tests:** two replicas and two projects, unlimited quotas, zero/absent targets, known queue age, histogram buckets and kinds, errored job trace, provider/collector unavailable, and trace sampling trust boundaries. Verify “no data” is distinguishable from healthy zero.

**Cost verification:** record measured telemetry bytes/minute, samples/second, storage growth, S3 operations/retries, provider deliveries, and peak process memory in P11. Provider billing budgets and maximum scaling limits are deployment configuration, not a promise generated by a dashboard.

## P9 — Runtime, images, release tooling, and staging launcher

**Modify** `.node-version`, `.nvmrc`, root `package.json`, root `Dockerfile`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.github/workflows/{ci.yml,cd.yml}`, `.github/dependabot.yml`, `docker/docker-compose.observability.yml`, `scripts/doctor/toolchain-checks.js`, and `scripts/staging-up.js`.

Choose an exact maintained patch of the intended supported Node LTS line at implementation time and use it consistently. Check both shell Node and pnpm-spawned Node in doctor; the last audit observed different versions. Keep Turbo/pnpm pinned consistently. Add a small drift check rather than relying on developers to remember every file. Do not switch framework or runtime major just to call the stack modern.

Select a supported Grafana release after reviewing its upgrade path; the currently pinned 11.5.x is out of support. Verify dashboards/data sources and back up its state before applying the upgrade to an existing deployment. Review other image support/scans too; a zero JavaScript dependency audit does not cover container operating-system packages. [Grafana support policy](https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/).

Package production outputs and production dependency closure instead of copying the whole installer workspace. Evaluate the current pnpm version's deployment support against this repository's workspace layout; do not blindly replace copying with `pnpm prune` and assume workspace symlinks are self-contained. [pnpm Docker deployment guidance](https://pnpm.io/docker).

The API runtime must retain compiled workspace packages, native Argon2/Piscina runtime assets, required translations/templates, and migration SQL/metadata. The web runtime must retain server/client output and the srvx/runtime dependency closure. Run both from a clean directory/container with no access to source-workspace paths. Keep non-root execution. Node is necessary inside these containers; build-only tooling is not a host prerequisite.

Resolve root/API Dockerfile duplication: either keep one canonical implementation with all consumers updated, or assert equivalent runtime/build inputs. Pin new provenance actions to reviewed commit SHAs; ensure attestation subject matches the actual pushed image digest. Include provenance verification in the release verification command for deployments consuming those artifacts.

Fix `scripts/staging-up.js` to return failure on `result.error`, signal termination, or missing status. Use repository-absolute paths; avoid unnecessary shell interpretation; preserve real Docker exit codes. Add a co-located script test for these exceptional outcomes.

**Completion:** clean image builds/scans pass; both images boot, serve, shut down, and run required jobs/migrations; removed tooling is absent; image sizes are recorded; runtime pins agree; staging launch failures propagate; provenance verifies for the tested digests.

## P10 — Reconcile rules, architecture claims, and project initialization

### P10a: authoritative documentation

**Modify** `ai_instructions/README.md`, `CORE_RULES.md`, `MODULE_RULES.md`, `FILE_PLACEMENT_RULES.md`, `EVENT_AND_ERROR_RULES.md`, `I18N_RULES.md`, `FRONTEND_RULES.md`, `SECURITY_AND_OPS_RULES.md`, and `TESTING_RULES.md` where their claims change. Keep `CODE_QUALITY_RULES.md` as the single source of file/function limits; do not silently relax limits to accommodate a large fix.

Reconcile `README.md`, `ARCHITECTURE.md`, `ARCHITECTURE_DEEP_DIVE.md`, `docs/{DATABASE,ENVIRONMENT,FRONTEND,FILE_UPLOADS,PRODUCTION_ARCHITECTURE,PRODUCTION_OPS,STARTING_A_NEW_PROJECT,NEW_MODULE}.md`, ADRs 0008/0042/0061, and the affected Redis/outbox/dead-letter/file/realtime/migration runbooks.

Correct the Result-to-HTTP examples, remove recommended `any`, align exception boundaries, explain consumer-completion publication versus provider delivery, record actual DB-backed account-version checks, clarify server/browser QueryClient lifetime, correct React override policy, and point design-token edits to the preset source. Document migration immutability, actual shutdown interfaces, scoped configuration exceptions, and runtime provider requirements consistently.

Replace universal claims such as “impossible to make mistakes” with precise guarantees and test coverage. Make README/instructions distinguish tested defaults from optional profiles. Historical ADR decisions may be superseded with an explicit note; do not erase their history silently.

### P10b: dependency rules and maintainable boundaries

**Modify** `.dependency-cruiser.cjs`, `scripts/check-rules.js`, and `scripts/generators/application.generator.js` only for concrete enforcement improvements.

Preserve existing cycle/module/domain/controller rules. Rename stale database-specific rules to reflect PostgreSQL/Drizzle. Retain permitted calls to another module's public commands/queries; inventory direct imports of internal listeners/workers/helpers and replace genuine leaks with a narrow owning command/query. Document internal application APIs before enforcing a blanket ban that would break intended communication.

During P3/P4/P7, remove unsafe query-shape casts from the touched persistence paths using real Drizzle/transaction types and typed test doubles. Make correctness-critical production dependencies required, with explicit adapters in isolated tests. Do not refactor every repository behind an interface or manufacture aggregates for CRUD merely to satisfy a label. The stated architecture should match the implemented modular/CQRS/Lite-DDD guarantees.

### P10c: reusable initialization and example removal

**Modify** `scripts/prune-examples.js`, root `package.json`, `scripts/project-init/project-plan.js`, its tests, and `docs/STARTING_A_NEW_PROJECT.md`.

Correct the actual web/mobile paths. Keep `disable:examples` a flag-based operation. For removal, provide a version-controlled checklist and verification, or an explicit dry-run-first removal plan that refuses unknown source divergence. Do not silently broaden the existing disable command into deletion.

Cover API module registration, routes/navigation, dashboard widgets, API client subclients, contracts/exports, permissions, file-parent registrations, lifecycle contributors, locales, fixtures/tests, generator smoke assumptions, and migration-check assumptions. Review `file_parent_type` and database fixtures rather than blindly deleting an enum value. Preserve frozen migrations; removal from an already migrated database uses an append-only schema change if needed.

Run the disable/removal verification in a disposable copy, then generate a neutral `projects/project` example with explicit ownership mode. Verify build, rules, transport parity, and auth/tenancy behavior without Notes routes or runtime imports. The checklist is acceptable if it is complete and exercised; a brittle AST/text-rewriting remover is not required for v1.

## Migration and rollback strategy

P3/P4 introduce real persistence changes. Reserve the next available migration numbers at implementation time; currently the lineage ends at `0006`. Use separate migrations for email delivery/idempotency changes and file scanning state where that simplifies review. Generate Drizzle snapshots/journal updates and add new frozen checksums; **never rewrite 0000–0006 or change their existing hashes**.

Use additive nullable/defaulted columns and indexes first. Define legacy-row behavior and backfill in bounded batches. New tables need the same explicit tenant/global ownership and restricted-role RLS integration coverage as existing infrastructure tables. A private claim field must not appear in public file DTOs or logs.

For a deployment that already exists, pause affected consumers, apply the additive migration, deploy compatible API/workers, reconcile pending work, and resume. Do not run old inline-scanning API code alongside new claimed workers during a rolling transition. Code rollback must not restore an unsafe mixed-worker state or drop already committed delivery intents. Prefer forward repair for processing-state changes, with documented recovery steps.

For a fresh project, the whole immutable migration chain must still produce the intended schema. Test both fresh and upgrade paths before accepting any migration commit.

## P11 — Release acceptance and evidence

An audit item closes only when its specific failure is covered and the complete affected flow passes. Passing unit tests alone is insufficient; rerunning unrelated tests repeatedly is not useful evidence.

**Run existing checks on the final revision:**

```text
pnpm rules:check
pnpm exec turbo run typecheck lint --force --concurrency=2
pnpm exec turbo run test:unit --force --concurrency=2
pnpm test:integration
pnpm --filter api test:e2e
pnpm test:generator
pnpm db:migrate:lineage
pnpm db:migrate:check
pnpm observability:check
pnpm build
pnpm bundle:check
pnpm format:check
pnpm audit
```

Supply isolated database/service configuration for commands that require it. A full workspace build includes the repository's configured mobile export; distinguish it from device testing. New production/pooler/alert checks from P1/P7/P8 must also run once implemented. Test the actual production image digests that will be distributed.

**Scenario matrix:**

| Scenario                   | Required evidence                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production browser         | Hydration, navigation, forms, restrictive CSP, error-page behavior; no CSP violations for legitimate scripts.                                               |
| Auth and tenant isolation  | Cross-tab rotation and timeout outcomes; replay rejected; cross-tenant data, cache, jobs, and realtime access denied.                                       |
| Consumer crash/retry       | Database effects/intent deduplicate; required failures retry; exhausted work is inspectable/replayable within the documented window.                        |
| Upload failure/concurrency | Exactly one committed file winner; no stale-owner overwrite/deletion; transient failures recover; web/mobile attach only when ready.                        |
| Slow realtime clients      | Bounded queue/bytes and disconnect deadline; healthy clients remain responsive; registry returns to baseline.                                               |
| Dependency outage          | Redis/DB/storage/email/telemetry failure preserves correctness, bounds retries, and produces actionable health/metrics.                                     |
| Deployment                 | Fresh and upgrade migrations; image readiness; graceful worker shutdown/restart; no incompatible old/new scanner overlap.                                   |
| Recovery                   | Backup restoration and replay/reconciliation drill with recorded RPO/RTO observations.                                                                      |
| Sustained workload         | Defined request/job/upload mix, concurrency, duration, resource limits, latency/error budgets, backlog drain, memory plateau, and telemetry/storage growth. |

Add a bounded scenario runner under a proposed `scripts/load/` directory using existing Node tooling first; cap concurrency, duration, and generated data. Keep a small deterministic CI smoke test separate from longer staging soak tests. Record throughput as an observed result on specified resources, never as a universal starter RPS claim.

**Cost release gate:** configure bounded service resources, autoscaling ceilings, telemetry retention/ingestion, file/object lifecycle, queue retries/retention, and provider quotas. Exercise alerts with synthetic data and record the expected deployment budget and billing alert owner. Budget alerts are not hard spend caps. Project-specific integrations and AI usage need their own limits before enabling them.

Record results in `docs/STARTER_RELEASE_VERIFICATION.md`: commit and image digests, runtime versions, supported profile matrix, commands/outcomes, scenario evidence, measured resource envelope, and unresolved limitations.

## Definition of completion

- H01, H04, H05, H08 and enabled H07 paths pass their failure-oriented integration tests.
- M01–M03, M06–M07, M09–M13 and L01/L04 have implementation, documentation, and applicable verification—not only a changed comment.
- Previously resolved H06, M04, M05, M08, L02, and L03 retain regression coverage; H02/H03 improvements are preserved while completing their residual work.
- No application/domain exception contract, public schema ownership, tenant boundary, localization rule, or migration immutability rule is weakened to make checks pass.
- The final release can be installed in a clean environment, configured from its documentation, and exercised through the supported production topology.
- Every issue is closed with evidence or explicitly listed as unavailable in an optional profile. An optional feature that is still advertised as supported must meet its acceptance tests.

This plan is complete in scope, but the exact implementation should still be reviewed as it is built. Production readiness comes from satisfying these contracts and tests, not from promising that a plan can prevent every future mistake.
