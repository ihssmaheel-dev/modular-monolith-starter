# Architecture starter audit and remediation — 2026-10-26

Branch: `codex/starter-audit-hardening`. Baseline: `c069dbaf2f9dfbb5a0f2f3021cf7e6e7d9884d3e`.

## Verdict

This is a substantial modular application foundation, with real authentication, tenant isolation,
authorization, transactional events, workers, storage, observability, and deployment wiring. The
reference Notes feature is an example of using that foundation. It is not the product boundary.

Several consequential defects were confirmed and corrected in this audit. They involved stale
authorization, concurrent writes, privacy workers, upload processing, delivery attempts, shutdown,
and client identity changes. Reusing the previous implementation unchanged would have carried
these defects into downstream applications.

**Release approval is still blocked by the dependency security gate.** The final dependency audit
currently reports two high advisories in Expo CLI dependencies. No audit exclusions, severity
reductions, or temporary exceptions were added. Passing functional checks cannot override that gate.

This report does not certify a particular ERP/CRM/SaaS deployment, its business rules, regulatory
compliance, throughput, or cloud expenditure. Those require the application's workload and deployment
evidence. No claim of zero security vulnerabilities or absence of memory leaks follows from an audit.

## Scope and evidence

Inspected the mandatory AI instructions, workspace/dependency manifests, application composition,
HTTP guards and transaction boundaries, base database repositories, outbox and queue infrastructure,
authentication/session and tenant access flows, files/scanning/cleanup, privacy/export/erasure,
notification delivery, cache/Redis lifecycles, telemetry, frontend/client authentication and uploads,
production configuration, backup tooling, CI, and relevant living documentation and tests.

Frontend coverage included shared client transports and refresh coordination, web bootstrap and
auth/tenant stores, query scoping, cross-tab channels, SSE lifecycle, CSP, upload/avatar/privacy flows,
mobile boot/auth/API/upload seams, UI object-URL cleanup, and escaped email templates. Operational
coverage included logger/metrics/tracing entry points, health and worker wiring, Redis/cache/realtime,
error reporting, feature flags, Compose/CD configuration, backups, and architecture generators.

This is a broad risk-driven source review with executable regressions, not a claim that all roughly
1,200 files under apps/packages/docker received equally deep line-by-line inspection. Generated files,
every UI primitive, every native screen, third-party internals, real cloud IAM/network configuration,
and long-running production behavior were not exhaustively assessed. Findings below distinguish
verified code defects from deployment evidence and optional capabilities.

## Verified findings and remediation

Severity describes the original defect. All entries in this section have implementation changes;
the validation section records which combined checks completed.

| ID  | Severity               | Root cause and realistic consequence                                                                                                                                                                                                                                                                                                   | Correction and supporting files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | CRITICAL/HIGH upstream | The baseline lockfile included exploitable framework/tooling advisories, including TanStack Start, Storybook, and the Next dependency of email preview tooling. Additional advisories appeared while the audit continued. A production/runtime advisory must not be dismissed because the starter currently has little business logic. | Updated compatible existing dependencies and narrow transitive overrides; regenerated the lockfile. Includes Start/router, Vite, Vitest, Storybook, Fastify, Zod 4, Undici, Nodemailer, body-parser, fast-uri, MCP SDK, Hono, ip-address, and other affected transitive dependencies. See [workspace overrides](../pnpm-workspace.yaml), [API manifest](../apps/api/package.json), [web manifest](../apps/web/package.json), and [lockfile](../pnpm-lock.yaml). Remaining advisories are explicitly listed below.                             |
| F02 | HIGH                   | Tenant authorization depended on a cached membership. A pre-commit cache invalidation followed by a concurrent read could repopulate revoked access; invalidating only the first page of memberships also left stale grants.                                                                                                           | Authorization now reads the indexed membership from the database. Cached display data is not an access authority. [ResolveTenantAccessQuery](../apps/api/src/modules/tenancy/application/queries/resolve-tenant-access.query.ts) and its tests cover revocation and changes.                                                                                                                                                                                                                                                                  |
| F03 | HIGH                   | Profile edits wrote cached email/name/role values back together. A name update could revert a concurrent role or verified-email change.                                                                                                                                                                                                | Persist only the requested profile fields. [UpdateUserCommand](../apps/api/src/modules/users/application/commands/update-user.command.ts) has a stale-profile regression.                                                                                                                                                                                                                                                                                                                                                                     |
| F04 | HIGH                   | A client retry after 401 rebuilt headers from current state. Switching organization/account during refresh could replay an earlier mutation under the new scope; late responses could return obsolete private data.                                                                                                                    | Snapshot identity and tenant per request; reject superseded requests before retry and after response. Preserve the original idempotency key. Both oRPC and REST use [request scope checks](../packages/api-client/src/auth/request-scope.ts), [oRPC transport](../packages/api-client/src/orpc.ts), and [REST transport](../packages/api-client/src/index.ts), with regression tests.                                                                                                                                                         |
| F05 | HIGH                   | Refresh handled an obsolete 401 before checking newer credentials; mobile lacked an auth fingerprint. Pending refresh/bootstrap could restore a signed-out session or overwrite a new session.                                                                                                                                         | Guard identity/fingerprint before error classification and credential adoption; guard bootstrap against logout/new login and mobile unmount. [RefreshCoordinator](../packages/api-client/src/auth/refresh-coordinator.ts), [web bootstrap](../apps/web/src/lib/session-bootstrap.ts), [mobile API](../apps/mobile/src/lib/api.ts), and [mobile layout](../apps/mobile/app/_layout.tsx).                                                                                                                                                       |
| F06 | HIGH                   | Cleanup selected an unlinked file and deleted its object later, while another request could attach it. The attachment could point to deleted storage.                                                                                                                                                                                  | Atomically claim a cleanup tombstone while rechecking eligibility before deleting bytes; linking/scanning cannot revive the tombstone. [FilesRepository](../apps/api/src/modules/files/infrastructure/repositories/files.repository.ts), [cleanup worker](../apps/api/src/modules/files/application/workers/file-cleanup.worker.ts), and real PostgreSQL cleanup regressions.                                                                                                                                                                 |
| F07 | HIGH                   | Scanner header reads had no body deadline or premature-close rejection and were not bound to the verified object identity. A stalled stream could occupy workers; overwrite races could change sampled bytes.                                                                                                                          | Conditional ETag/version reads, a 4 KiB range, a 10-second body deadline, listener cleanup, and bounded SDK transport settings. [Scanner](../apps/api/src/infrastructure/storage/scanner/file-scanner.service.ts), [S3 driver](../apps/api/src/infrastructure/storage/drivers/s3.driver.ts), and tests. Quarantine and promotion checks remain enforced.                                                                                                                                                                                      |
| F08 | HIGH                   | Erasure collection treated a failed organization page as successful completion, then removed memberships. The persisted purge plan could permanently omit later tenants. Password work and session/cache I/O also extended the transaction.                                                                                            | Fail on any collection-page error, prepare credential/hash work outside the write transaction, check auth-version failure, and move external cleanup after commit. [RequestAccountErasureCommand](../apps/api/src/modules/privacy/application/commands/request-account-erasure.command.ts), [AnonymizeUserCommand](../apps/api/src/modules/users/application/commands/anonymize-user.command.ts), and regressions.                                                                                                                            |
| F09 | HIGH                   | Privacy raw SQL used `RETURNING *` and cast pg rows to Drizzle row types. Raw results retained snake_case names and timestamp strings, so real workers lost subject/tenant/date fields despite mocks passing.                                                                                                                          | Explicit aliases and date decoding for both export and erasure claims. [PrivacyRepository](../apps/api/src/modules/privacy/infrastructure/repositories/privacy.repository.ts) and real database claim regressions.                                                                                                                                                                                                                                                                                                                            |
| F10 | HIGH                   | Export/erasure completion could overwrite a reclaimed or completed request. An old export worker could publish a second completion event.                                                                                                                                                                                              | Finalization/failure updates require `PROCESSING` and the claimed attempt number; export expiry is rechecked. Publish completion only after a successful conditional write. [PrivacyRepository](../apps/api/src/modules/privacy/infrastructure/repositories/privacy.repository.ts), [export command](../apps/api/src/modules/privacy/application/commands/request-export.command.ts), and [purge command](../apps/api/src/modules/privacy/application/commands/purge-expired-erasures.command.ts).                                            |
| F11 | HIGH                   | Notification delivery preclaimed 50 items with a two-minute lease, then processed them sequentially. Later leases could expire before delivery began. Stale attempts could overwrite new attempts.                                                                                                                                     | Claim immediately before each delivery, bound each run to 50, and fence completion/failure by status and attempt number. Update notification channels only after the claim completes. [Delivery worker](../apps/api/src/modules/notifications/application/workers/notification-delivery.worker.ts), [repository](../apps/api/src/modules/notifications/infrastructure/repositories/delivery-intents.repository.ts), and real database fencing tests.                                                                                          |
| F12 | HIGH                   | The SQL recording a delivered channel passed an untyped parameter to `jsonb_build_array`; PostgreSQL rejected it. A successful external delivery could then be treated as failed and retried.                                                                                                                                          | Explicit `::text` parameter type. Real PostgreSQL tests reproduce and verify delivery and duplicate-completion behavior in [delivery-intents integration tests](../apps/api/src/modules/notifications/infrastructure/repositories/delivery-intents.integration.test.ts).                                                                                                                                                                                                                                                                      |
| F13 | HIGH                   | Mobile uploads used a legacy FileSystem function exported by the installed Expo package specifically to throw at runtime. Its test mock hid the defect.                                                                                                                                                                                | Use the supported `new File(uri).bytes()` API from the existing dependency; remove manual base64/number-array expansion. [Native uploads](../apps/mobile/src/features/files/files.mutations.ts) and native-seam regressions. Real-device validation remains outstanding.                                                                                                                                                                                                                                                                      |
| F14 | MEDIUM                 | Optimistic version zero used a truthiness check and could return a missing record instead of a conflict. The auth-version path incremented the wrong column. Soft-deleted rows could be updated before being hidden from the return value.                                                                                             | Test `expectedVersion !== undefined`, increment the actual version column, and include tenant/deletion/version conditions in the SQL update. [BaseRepository](../apps/api/src/infrastructure/database/repositories/base.repository.ts) and [concurrency regressions](../apps/api/src/infrastructure/database/repositories/base.repository.concurrency.test.ts).                                                                                                                                                                               |
| F15 | MEDIUM                 | The reference partial note update wrote both previously read fields, so unrelated concurrent title/content edits could overwrite each other. Reference code would teach downstream modules the wrong PATCH pattern.                                                                                                                    | Persist only provided fields after domain normalization. [UpdateNoteCommand](../apps/api/src/modules/notes/application/commands/update-note.command.ts) and two partial-update tests. The generator already followed this pattern.                                                                                                                                                                                                                                                                                                            |
| F16 | HIGH                   | Stored outbox rows had no schema version; relay delivery always interpreted events as version 1. Evolving event payloads would make backlog replay ambiguous. The no-queue local path skipped required consumers before acknowledging events.                                                                                          | Persist a positive schema version, validate before write, dispatch using the stored version, reject unsupported versions, propagate metadata, and await required consumers in local fallback. [Outbox service](../apps/api/src/infrastructure/outbox/outbox.service.ts), [envelopes](../packages/contracts/src/schemas/outbox.schema.ts), and [relay](../apps/api/src/infrastructure/outbox/services/outbox-relay.delivery.ts). Append-only migration and fresh/upgrade backfill checks included.                                             |
| F17 | MEDIUM                 | A shutdown deadline could be consumed by the first worker and skip cleanup of remaining workers/queues. Redis QUIT could wait indefinitely.                                                                                                                                                                                            | Pause/drain workers concurrently, use bounded close/forced-close behavior, disconnect stalled queues, and bound Redis shutdown with forced disconnection. [QueueService](../apps/api/src/infrastructure/queue/queue.service.ts), [Redis close helper](../apps/api/src/infrastructure/redis/close-redis-connection.ts), and fake-timer regressions. Durable handlers must remain idempotent after forced termination.                                                                                                                          |
| F18 | MEDIUM                 | Cache coalescing could retain a rejected promise after a synchronous fetcher throw; its distinct-key map was unbounded. A failed Redis heartbeat could also accumulate overlapping lease renewals.                                                                                                                                     | Register the promise before calling the fetcher, clean on either result, cap retained coalescing keys at 1,000, and allow at most one lease renewal in flight. [CacheService](../apps/api/src/infrastructure/cache/cache.service.ts), [RedisLockService](../apps/api/src/infrastructure/redis/redis-lock.service.ts), and regressions. The cap is not a global request admission limit.                                                                                                                                                       |
| F19 | MEDIUM                 | Realtime dead-letter diagnostics grew without a retention bound. Subscription replacement/shutdown could leave reconnect work or listeners active.                                                                                                                                                                                     | Approximate Redis stream MAXLEN of 1,000 diagnostics, bounded connection close, serialized feature-flag subscriber replacement, listener removal, and shutdown guards. [Dead-letter stream](../apps/api/src/infrastructure/realtime/streams/realtime-stream.dead-letter.ts), [stream consumer](../apps/api/src/infrastructure/realtime/streams/realtime-stream.consumer.ts), and [feature flags](../apps/api/src/infrastructure/feature-flags/feature-flags.service.ts). Durable business work is not placed in this lossy diagnostic stream. |
| F20 | MEDIUM                 | Upload polling's deadline did not cancel an outstanding status request. XHR timeout/abort paths could leave promises pending; native transfers lacked a transfer deadline.                                                                                                                                                             | Propagate cancellation through status GETs, enforce upload processing and transfer deadlines, reject XHR timeout/abort, and remove timers/listeners. [Shared upload orchestration](../packages/api-client/src/subclients/upload.ts), [web uploads](../apps/web/src/features/files/files.mutations.ts), and native upload tests.                                                                                                                                                                                                               |
| F21 | MEDIUM                 | Error reporting left response bodies unconsumed; client URLs could retain credentials or fragment tokens. Restore output printed the connection URL.                                                                                                                                                                                   | Cancel reporting response bodies, strip URL credentials/fragments, redact sensitive query values, and remove restore credential output. [Error reporter](../apps/api/src/infrastructure/error-reporting/error-reporter.service.ts), [sanitizer](../apps/api/src/infrastructure/error-reporting/sanitize-telemetry.ts), and [restore script](../scripts/db-restore.sh).                                                                                                                                                                        |
| F22 | MEDIUM                 | Backup retention split paths containing spaces and could publish partial archives or prune good backups after a failed dump.                                                                                                                                                                                                           | Private temporary archive, verified gzip, atomic publication, safe filename handling, positive retention validation, and failure cleanup. [Backup script](../scripts/db-backup.sh), four shell regressions, and CI wiring. This does not supply off-site storage or a production restore drill.                                                                                                                                                                                                                                               |
| F23 | HIGH                   | Web SSR could prefer runtime `VITE_*` values while the browser used baked build values. CD passed only the API URL; Compose advertised runtime branding/example flags that could not change the browser bundle. CSP, example routes, and hydration could disagree.                                                                     | Use one validated public build configuration for SSR/browser; wire all four public Docker build arguments in CD/staging/tests and remove misleading production runtime entries. [Web env](../apps/web/src/lib/env.ts), [CD](../.github/workflows/cd.yml), and [production Compose](../docker/docker-compose.prod.yml).                                                                                                                                                                                                                        |
| F24 | MEDIUM                 | CSRF and metrics checks compared string lengths before timingSafeEqual on UTF-8 buffers. Equal character counts with different byte lengths could throw a RangeError and produce 500s on invalid input.                                                                                                                                | Compare byte lengths before constant-time comparison. [Auth guard](../apps/api/src/common/guards/auth.guard.ts), [CSRF guard](../apps/api/src/common/guards/csrf.guard.ts), and Unicode regressions. Cookie-authenticated mutations retain CSRF enforcement.                                                                                                                                                                                                                                                                                  |
| F25 | LOW/MEDIUM             | Living docs and AI examples drifted from runtime versions, auth persistence, event delivery, transaction ownership, and file placement. Such examples can reintroduce defects in generated application work.                                                                                                                           | Updated README, production/tenancy/files/privacy/development guides, and eight instruction documents. Corrected throwing application-layer authorization advice, unrestricted proxy examples, outdated frontend/E2E paths, durable-event guidance, lifecycle cleanup, and migration numbering.                                                                                                                                                                                                                                                |

## Remaining dependency blockers

The 2026-10-26 audit after compatible patches reports **0 critical, 2 high, 0 moderate, 0 low**.
These counts are registry results at verification time, not a permanent guarantee.

| Severity | Dependency chain                                    | Status and required resolution                                                                                                                                                                                                                                                                                 |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | `apps/mobile > expo > @expo/cli > node-forge@1.4.0` | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): registry reports no patched version. Await an upstream fix or a reviewed removal/replacement of this tooling path. It is not remediated by changing the audit threshold.                                                             |
| HIGH     | `apps/mobile > expo > @expo/cli > zod@3.25.76`      | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): the published fix is Zod 4.6.6. The starter's Zod 4 consumers are upgraded; forcing the CLI's Zod 3 dependency to a different major is not established as safe. An upstream-compatible CLI update or reviewed migration is required. |

Earlier braces findings were no longer present in the registry response on 2026-10-26. Their absence
is not evidence from this audit that arbitrary watcher patterns are safe. No advisory was muted.

Selected upstream sources checked: [Start XSS](https://github.com/advisories/GHSA-qx66-fv34-fjm8),
[Storybook](https://github.com/advisories/GHSA-f2ph-cmg5-wxc8),
[Fastify](https://github.com/advisories/GHSA-389g-gv7q-r4x8),
[Undici](https://github.com/advisories/GHSA-xjj6-f33q-929c),
[body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[Nodemailer](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8),
[fast-uri](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), and
[Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/).

## Existing safeguards retained

- Deny-by-default authorization, explicit action policies, trusted tenant context, tenant conditions,
  and PostgreSQL RLS. Frontend permission components provide UX; backend authorization is the boundary.
- Short explicit SQL transactions; the old request-wide transaction-starvation concern is already
  addressed. Argon2 and ordinary external operations do not require a request-long connection.
- Uniform invalid-credential responses, password hashing, account-version invalidation, refresh
  rotation/session controls, CSRF defenses, and memory-only browser tokens with HttpOnly cookies.
- Digest window row locks and transactional notification/outbox writes. There was no basis to
  reintroduce a second scheduler platform or replace the locking strategy.
- Outbox acknowledgment after required consumer success, operation receipts, replayable failures,
  quarantine uploads, metadata checks, file quotas, and promotion fencing.
- Per-request SSR QueryClients, tenant-scoped caches/channels, channel/SSE teardown, bounded client
  error deduplication, object-URL revocation, and escaped React email content.
- Production resource/log limits, private application ports, immutable image references, distinct
  migration credentials, worker separation, trace sampling, image scanning, and CI final gating.
- Dashboard/config validation and alert-rule tests. They verify configuration consistency, not that
  every metric has been observed or every pager/dashboard works against a real deployed workload.

## Long-term architecture and resource assessment

The module structure can support a larger application if teams preserve aggregate and ownership
boundaries. Commands/queries/policies/events/repositories stay within a domain module; cross-module
calls use application APIs. Public schemas and clients remain capability packages. Further folder
subdivision should follow actual subdomains, rather than creating generic `utils` or `services` dumps.
No premature microservice split or new repository-interface framework is justified by these findings.

Delivery remains **at least once**. A database receipt cannot make SMTP or push exactly once after a
provider accepts work and the process crashes before recording success. Provider operation identities,
effect-specific idempotency, and reconciliation remain necessary for irreversible business effects.
Redis leases are cooperative authority, not protection against a paused stale process by themselves;
resource writes need their own fencing, as the file/privacy/notification changes demonstrate.

Bounded pools, worker batches, cache entries, streams, upload sizes, telemetry sampling/retention,
and container limits reduce resource exposure. They do not cap total account spend. Cloud budgets
alert after consumption; deploy maximum replica counts, provider quotas, object lifecycle rules,
database/storage alarms, and tested admission flags. Already accepted durable work still consumes
resources after admission stops. No AWS bill, RPS ceiling, or long-term heap trend was measured here.

## What belongs in the foundation

| Classification               | Capabilities                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required core                | Contract/validation/error conventions; authentication and backend authorization boundaries; explicit tenant context where enabled; safe transactions/migrations; bounded infrastructure lifecycles; durable event/idempotency conventions; structured telemetry and dependency readiness; tests, CI gates, secret/config validation. |
| Recommended core improvement | Broader real process tests for single/multi tenancy and examples disabled; workload-specific load/soak fixtures; quieter React test lifecycles; deployment restore drills and a documented upgrade cadence. These are evidence/maintenance improvements, not reasons to add another framework.                                       |
| Optional modules             | Organization provisioning for products that need it; MFA/OIDC/SSO; intelligence/Python workloads; webhooks/integrations; search; realtime; email/push; advanced file scanning; import/export jobs. Retain explicit interfaces and enable only the modules a product uses.                                                            |
| Project-specific             | ERP accounting, CRM workflows, CAFM/APS scheduling, approval state machines, subscription rules, retention/legal-hold policy, immutable ledger semantics, consent purpose, provider choices, cloud IAM/networking, and required SLO/RTO/RPO.                                                                                         |

Privacy is an extension contract, not universal compliance. Preserve pseudonymous subjects for
historical references; each future module must register export/deletion/retention behavior and decide
which immutable business facts survive deletion. Do not add cascade deletes to generic user cleanup.

## Validation record

Node 24.21.0 and pnpm 10.34.5 were used for combined validation. Earlier focused checks sometimes
ran under the host's Node 22 shim; combined verification uses the repository's supported runtime.
Disposable Docker project `codex-audit-20261023` owns the integration dependencies; no production or
pre-existing developer volumes are selected for cleanup.

| Command / evidence                                      | Result                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                        | Passed after dependency updates.                                                                                       |
| `pnpm rules:check`                                      | Passed: 678 modules, 2,665 dependency edges; tokens and global rules passed.                                           |
| `pnpm lint`                                             | Passed across API/web/mobile/UI; an unsafe optional chain in a new test was corrected.                                 |
| `pnpm typecheck`                                        | Passed after correcting the web environment test's Node-global assumption.                                             |
| `pnpm db:migrate:check`                                 | Passed fresh and upgrade paths, including pending outbox payload/version preservation and positive-version constraint. |
| `pnpm db:migrate`                                       | Passed against the disposable integration database.                                                                    |
| `pnpm test:generator`                                   | Passed feature/skip-mobile smoke and six project-branding tests.                                                       |
| Notification delivery PostgreSQL regression             | Four tests passed after fixing the JSONB parameter type.                                                               |
| `pnpm audit --json`                                     | Failed intentionally: two high Expo CLI dependency findings above; gate stays blocking.                                |
| Full `pnpm test:release`                                | Passed; the last producer correction also passed a fresh complete API unit run and rebuilt production smoke.           |
| Full API/browser E2E and production image/browser smoke | Passed: 39 API E2E, 17 browser E2E with retries disabled, and 2 rebuilt-container browser tests.                       |

Combined unit results: **1,400 tests** — API 1,053 across 183 files; web 201 across 48 files;
mobile 101 across 24 files; SDK 23 across four files; authorization 22 across two files.
`pnpm --filter api test:integration` passed all 18 tests across five files. `pnpm observability:check`
and `pnpm observability:rules:test` passed; promtool found 41 alert rules. Storybook built successfully.
API/web/shared builds and the iOS/Android exports passed; the web budget measured 423,223 gzip bytes
across 78 scripts. `node --test scripts/db-backup.test.js` passed all four backup/restore regressions.

The first full browser run completed with two retries, during concurrent cold container/Storybook/
native builds. Registration was still pending at the five-second UI assertion, and the attachment
journey exhausted its 30-second total deadline despite reaching the attachment screen. Its evidence
was preserved under ignored `.pkg-audit/browser-first-run/`. After the builds settled, the complete
suite passed **17/17 on two workers with `--retries=0` in 59.6 seconds**. No assertion or timeout was
relaxed. This does not prove the suite can never flake under resource contention.

Earlier focused evidence: SDK 23 tests; focused web 33 tests; mobile 24 tests and a final 13-test
subset; security/storage/privacy unit coverage 96 tests; operations 44 tests; backup shell 4 tests;
database/outbox focused 57 tests; queue shutdown 4 tests. These subsets overlap and must not be
added together as a count of unique tests. Combined suites below supersede subset totals.

Initial integration execution found the notification JSONB defect; all 18 integration tests passed
after correction. API E2E then caught the new producer validation rejecting class-based domain
events. Producer validation now normalizes their own data properties to the plain persisted record;
the regression uses the actual `UserCreatedEvent`, and all 39 API E2E tests pass. Initial web
environment tests attempted to separate `process.env` and
`import.meta.env` inside Vitest, whose evaluator aliases them. The corrected unit tests check validated
values in both render contexts. The rebuilt production image passed the stronger browser regression:
conflicting container runtime branding/API/upload values cannot change the baked SSR title or CSP.

F26 — LOW, fixed: an additional tooling defect was reproduced after generating browser failure artifacts: the rules
checker scanned Playwright's bundled report JavaScript and reported 178 false source violations.
Its existing generated-output exclusions now include `playwright-report`, `test-results`, and
`test-results-production`. Application/test source files remain checked. The global rules check
passes with those generated artifacts still present; no production source rule was disabled.

## Rollout and remaining evidence

1. Apply `0001_outbox_schema_version.sql` before starting the updated API/worker. The baseline
   migration and its checksum remain unchanged. Backlog rows become version 1; never reinterpret
   unsupported event versions silently. Deploy compatible consumers before enabling any new version.
2. Set public web configuration at image build time: `VITE_API_URL`, `VITE_FILE_UPLOAD_ORIGIN`,
   `VITE_APP_NAME`, and `VITE_EXAMPLE_FEATURES_ENABLED`. Rebuild to change these values. Keep the
   API's `EXAMPLE_FEATURES_ENABLED` consistent with the chosen browser build.
3. Resolve the two dependency blockers without weakening the audit. Rerun CI and container scans
   against the exact reviewed commit; local source/unit results do not substitute for image scanning.
4. Verify native uploads on real iOS/Android devices, storage CORS/origins, scanner/provider behavior,
   and the actual proxy/HTTPS/cookie configuration.
5. Run representative load and failure/soak tests, measure pool wait time/heap/queue lag, test backup
   restore and alarms, and establish SLO/RTO/RPO and provider cost quotas before serving customers.

Residual test limitations: generic query helpers do not universally forward cancellation signals;
ordinary already-issued reads may finish after cache removal. Browser/native long-running memory,
all-screen accessibility, production provider failover, and cloud budget enforcement were not proven.
The existing frontend tests also emit React `act`/react-test-renderer and jsdom API warnings; these
are recorded rather than suppressed. No native test-framework replacement was introduced.

Committing and pushing this remediation branch does not approve a release. Merge, publication,
and deployment remain subject to the dependency blockers and rollout checks above.
