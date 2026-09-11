# Production starter audit

Date: 2026-09-11. Audited revision: **3fb0264a5ad5714ac4f4dccd24571b60eca48d02**.

This review evaluates a general-purpose application foundation. Notes is treated as a reference vertical slice. Its domain requirements are not used to judge product completeness.

## Verdict

**This is a substantial foundation with useful implementation work, but it is not ready to be called a production-ready v1.0 starter. I would not launch a serious SaaS, ERP, or CRM from the audited revision without remediation.**

The largest problem is not missing enterprise features. Several existing infrastructure components do not preserve their intended guarantees when combined. There is a reproduced authorization bypass, a reproduced Nest module registration failure, incorrect transaction callback ordering, and destructive data-lifecycle work that cannot roll back with its database transaction.

Keep the modular monolith and the existing stack. Fix security boundaries, transaction and delivery semantics, deployment, and verification before adding more modules. Nothing found justifies a migration to microservices or a replacement framework.

The recommendations distinguish four placements:

- **Must have in the core:** necessary for a safe foundation, even if implemented through a small contract or deployment convention.
- **Should have in the core:** broadly reusable, with a lightweight default.
- **Optional module/plugin:** included and operated only when a project needs it.
- **Should NOT belong in the boilerplate:** business rules or infrastructure complexity that projects must choose themselves.

## Scope, method, and confidence

The review covered the repository inventory, all seven backend module areas, shared infrastructure, web and mobile authentication/data flows, contracts, authorization, API clients, database schemas/migrations, generators, CI/CD, Docker, and operational documentation. The mandatory ai_instructions were read first.

Implementation inspection concentrated on security boundaries, commands and queries, repositories, lifecycle workers, transport integration, and failure paths. Tests and static searches supplemented those reads. Generated assets and every UI story were not individually executed or visually inspected. A file existing, a README claim, or a passing mock test was not treated as proof of runtime functionality.

This is a source and local-execution audit, not a completed penetration test or production load certification. Findings below distinguish:

- **Reproduced:** exercised against the checked-out implementation with an isolated harness or compiler.
- **Source-confirmed:** a concrete path exists in the inspected code; the production trigger was not exercised against live infrastructure.
- **Design gap:** a missing contract or safeguard with a stated future failure scenario.

No application fixes, dependency upgrades, migrations, external account actions, or data deletion were performed. The audit document is the only intended tracked change.

### Verification performed

| Check                                                    | Result                                 | What it establishes                                                                                 |
| -------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| pnpm rules:check                                         | Passed                                 | Architecture scan: 528 modules, 2,092 dependencies; design tokens and repository rule checks passed |
| pnpm turbo lint --force                                  | Passed, four tasks, no cache           | Current configured lint rules pass                                                                  |
| pnpm turbo typecheck --force                             | Passed, ten tasks, no cache            | Configured workspace checks pass; the web application is omitted by its script                      |
| Direct web tsc --noEmit -p tsconfig.app.json             | **Failed: 69 TypeScript diagnostics**  | Includes application routing/upload errors and test typing errors                                   |
| API unit tests                                           | 123 files, 610 tests passed            | Isolated API behavior covered by those tests                                                        |
| Web unit tests                                           | 33 files, 122 tests passed             | Configured web unit suite passes                                                                    |
| Mobile unit tests                                        | 22 files, 96 tests passed              | Configured mobile unit suite passes                                                                 |
| Authorization package tests                              | Two files, 19 tests passed             | Existing evaluator tests pass despite the bypass described below                                    |
| API client package tests                                 | Four files, 14 tests passed            | Existing transport/upload tests pass                                                                |
| API build                                                | Passed                                 | TypeScript production output can be generated                                                       |
| Web build                                                | Passed                                 | Client/server bundles can be generated; this does not repair the omitted typecheck                  |
| pnpm audit --json                                        | **Two critical and one high advisory** | Dependency advisory matches, with reachability assessed separately below                            |
| Forged ownership harness                                 | **Permission granted**                 | Actual PermissionsGuard and AuthorizationService accept attacker-supplied ownership                 |
| Nest module compilation harness                          | **Failed**                             | TenancyModule exports providers it does not register                                                |
| Transaction sequencing harness                           | **Effect before COMMIT**               | Actual DatabaseService callback sequencing is incorrect                                             |
| Idempotency fingerprint harness                          | **Two resource URLs hash identically** | Path parameters are omitted from the fingerprint                                                    |
| Docker-backed integration/E2E, image boot, restore drill | **Not executed locally**               | Docker Desktop's Linux engine was unavailable                                                       |

**861 unit tests passed across 184 files.** These are not 861 integration guarantees. The contracts package did not expose a test:unit task in the selected package run; it is not included in that total.

The isolated proofs transpiled the checked-out TypeScript while preserving Nest decorators. They used fake requests/transaction completion where appropriate and did not contact a live database. The Nest compiler proof used the real Nest testing module compiler.

## Existing work worth keeping

These are concrete strengths, subject to the integration defects later in the report.

| Area                       | Verified implementation worth preserving                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module structure           | Backend domains have presentation/application/domain/infrastructure separation. Dependency-cruiser enforces important backend import rules. Cross-domain workflows generally call exported commands/queries rather than importing another module's tables.              |
| Contracts and localization | Zod/oRPC contracts, response mappers, a shared API client, localized error envelopes, and en/es/fr translations exist. These provide a usable baseline for consistent APIs and screens.                                                                                 |
| Authentication primitives  | Argon2 password hashing, hashed reset/verification tokens, expiry checks, atomic token consumption, JWT issuer/audience/key identifiers, signing-key rotation configuration, and production Secure/HttpOnly cookies exist. Registration is gated by email verification. |
| Revocation                 | HTTP authentication checks the current user/authVersion rather than trusting a long-lived role claim alone. Password reset increments the version. This is a useful immediate-revocation primitive.                                                                     |
| Tenant foundation          | Deployment-controlled single/multi modes, membership resolution, tenant-aware repositories, transaction-local PostgreSQL settings, and FORCE ROW LEVEL SECURITY policies exist. These are materially stronger than trusting an x-tenant-id header alone.                |
| Persistence                | Parameterized SQL/Drizzle queries, tenant/status indexes, bounded public pagination, soft-delete support, pool/statement/lock timeouts, and explicit application transactions exist.                                                                                    |
| Outbox                     | Events can be persisted with mutations. SQL claims use FOR UPDATE SKIP LOCKED, with stale-lock recovery, retry/backoff, dead-letter state, and retention. Keep this foundation and correct its delivery semantics.                                                      |
| Realtime                   | Per-instance Redis stream consumer groups support fanout across API replicas; this avoids accidentally distributing each message to only one server. Connection caps, stream trimming, heartbeat/reaping, and dead-letter handling exist.                               |
| Operations                 | Pino logging, request IDs, OpenTelemetry, Prometheus metrics, dependency readiness checks, load shedding, dashboards, alerts, and incident runbooks are implemented. The error collector has a timeout and circuit breaker.                                             |
| Delivery tooling           | Multi-stage/non-root Docker builds, CI checks, dependency auditing, secret scanning, migration locking, backup/restore scripts, and restore verification in CI are present. Their existence should be credited without assuming the deployment path works.              |
| Frontend foundation        | TanStack Query, feature modules, route loaders, React Hook Form/Zod, Base UI primitives, tokens, Storybook, responsive shell, theme support, loading/empty/error states, and error boundaries are available.                                                            |
| Mobile                     | Shared contracts/client intent, Expo routing, SecureStore credentials, localization, and feature tests exist. Mobile should remain an optional starter surface.                                                                                                         |

Representative implementations: [AppModule](../apps/api/src/app.module.ts), [database](../apps/api/src/infrastructure/database/database.service.ts), [migration](../migrations/pg/0000_initial.sql), [outbox repository](../apps/api/src/infrastructure/outbox/outbox.repository.ts), [health](../apps/api/src/infrastructure/health/health.service.ts), [error reporting](../apps/api/src/infrastructure/error-reporting/error-reporter.service.ts), [CI](../.github/workflows/ci.yml), [UI package](../packages/ui).

## Prioritized findings

Severity definitions follow the requested contract: CRITICAL can enable a security breach, data corruption, major outage, or fundamental failure; HIGH creates serious production risk; MEDIUM needs architectural or maintainability work; LOW is nonurgent improvement; OPTIONAL is conditional capability.

Severity assumes the feature is enabled and exposed. The startup failure does not neutralize the security findings: repairing startup alone would expose them.

### C01 — CRITICAL — Client-provided ownership bypasses authorization

**Reproduced.** PermissionsGuard constructs a resource from raw request parameters/body, including body.ownerId. The evaluator grants any requested action when that owner equals the principal. Nest guards run before controller validation, so stripping unknown DTO fields later does not repair the decision.

A normal user can send their own ID as ownerId while targeting another user's ID on the global user-update endpoint. The guard grants users:write. UpdateUserCommand receives no actor and does not perform an independent authorization check. Its accepted fields include email.

The isolated request used a user-role principal, a different target ID, and attacker-controlled ownerId; the guard returned true. The remaining source path permits changing the target's email. For a known privileged-account ID, directing password recovery to the replacement email is an account-takeover path. This full HTTP/email chain was not executed.

**Fix before deployment:** remove ownership and arbitrary request attributes from coarse permission decisions. Load trusted resource facts inside the command/query and authorize the specific action there. Separate own-profile edits from administrative user management. Add negative HTTP tests through both exposed transports; the REST path is the directly traced bypass, and the oRPC guard must be tested against its actual wire envelope.

**Placement:** Must have in the core.

Evidence: [PermissionsGuard](../apps/api/src/common/guards/permissions.guard.ts), [evaluator](../packages/authorization/src/evaluator.ts), [users controller](../apps/api/src/modules/users/presentation/users.controller.ts), [update command](../apps/api/src/modules/users/application/commands/update-user.command.ts).

### C02 — CRITICAL — The registered application module graph cannot boot

**Reproduced.** TenancyModule.forRoot exports PurgeExpiredInvitationsCommand and InvitationRetentionWorker but does not include either in its providers or imported module exports. The real Nest compiler rejects PurgeExpiredInvitationsCommand as an invalid export.

AppModule always imports TenancyModule.forRoot, including single-tenant mode. This is an application startup blocker, despite successful TypeScript compilation and unit tests.

**Fix:** register the providers and run a complete application/worker composition smoke test. Continue resolving the graph until both roles boot; this audit does not assert that correcting these two entries reveals no further startup defects.

**Placement:** Must have in the core.

Evidence: [TenancyModule](../apps/api/src/modules/tenancy/tenancy.module.ts), [AppModule](../apps/api/src/app.module.ts).

### C03 — CRITICAL — Erasure can destroy object bytes while rolling back their database state

**Source-confirmed.** Account and organization erasure run inside a database transaction, call into file purge, and delete S3 objects before deleting their rows. The file command says it runs without a long transaction, but its caller supplies an ambient transaction.

If object deletion succeeds and a later SQL/outbox/purge step fails, PostgreSQL can restore the rows while the bytes remain deleted. The request may report failure even though irreversible work occurred. The advertised 30-day grace period does not preserve the data already purged immediately.

**Fix:** commit an erasure plan/restriction first. Perform external deletion in bounded, idempotent jobs with durable per-step progress and explicit partial-failure status. Make project retention and legal-hold policy decide what can be deleted. Never imply that a SQL rollback restores an object store.

**Placement:** Must have lifecycle/external-effect conventions in core; erasure orchestration is an optional module; business retention rules belong to each application.

Evidence: [account erasure](../apps/api/src/modules/privacy/application/commands/request-account-erasure.command.ts), [organization erasure](../apps/api/src/modules/privacy/application/commands/request-organization-erasure.command.ts), [file purge](../apps/api/src/modules/files/application/commands/purge-user-files.command.ts).

### H01 — HIGH — After-commit effects run before commit; nested Result transactions lack rollback semantics

**Reproduced/source-confirmed.** DatabaseService drains afterCommit callbacks inside the callback passed to Drizzle.transaction. PostgreSQL commit occurs only after that callback resolves.

Observed order:

```text
BEGIN -> mutation -> external-effect -> COMMIT
```

This can emit audit/activity events for a transaction that subsequently fails, invalidate caches before the new rows are visible, or start downstream work before its prerequisite data commits. Callback execution is also outside the child CLS runWith invocation, making inherited context behavior different from the mutation.

When a transaction already exists, withResultTransaction simply executes its callback and returns an Err without a savepoint or rollback-only marker. If an outer workflow catches/continues on that Err, earlier writes remain in the outer transaction. A Result type is not itself a rollback guarantee.

**Fix:** drain best-effort callbacks only after the outermost transaction promise resolves successfully. Persist required effects in that transaction's outbox. Define nested semantics explicitly: propagate failure to abort the unit of work, or use a real savepoint where partial recovery is intended. Add commit-failure and nested-error tests using real PostgreSQL.

**Placement:** Must have in the core.

Evidence: [DatabaseService](../apps/api/src/infrastructure/database/database.service.ts), [transaction interceptor](../apps/api/src/common/interceptors/database-transaction.interceptor.ts).

### H02 — HIGH — JavaScript tenant context and PostgreSQL scope can disagree

**Source-confirmed; restricted-role execution still required.** TenantContextService.run/runSystem changes CLS only. PostgreSQL settings are established when DatabaseService opens a transaction. Changing CLS while reusing an existing transaction does not change those settings.

Concrete cases:

- Privacy iterates tenant contexts inside one existing transaction without calling setTenantContext. Under enforced RLS, the loop can see no rows for the requested tenant and leave data behind.
- DigestWorker.runSystem calls findDueWindows without opening a scoped transaction. Its SQL connection has no app.system_scope setting and can return zero eligible rows under RLS.
- verifyTenancyMode opens system scope but calls database.getDb instead of getTx, so its organizations query runs outside that scope and can incorrectly count zero.
- Outbox listeners run with system CLS, but listeners such as MembershipUserListener do not establish the database scope themselves. Their updates can silently affect no rows.

RLS helps fail closed here; that prevents many leaks but does not make erasure, synchronization, or background processing correct. A superuser development connection can hide all of these defects.

**Fix:** expose one scoped unit-of-work API that binds principal, tenant/system capability, transaction, and SQL settings. Prevent scoped repository access outside it. Test every worker and cross-tenant workflow using a non-superuser, non-BYPASSRLS application role.

**Placement:** Must have in the core.

Evidence: [tenant context](../apps/api/src/infrastructure/database/context/tenant-context.service.ts), [database service](../apps/api/src/infrastructure/database/database.service.ts), [mode verification](../apps/api/src/infrastructure/database/verify-tenancy-mode.ts), [digest worker](../apps/api/src/modules/notifications/application/workers/digest.worker.ts), [membership listener](../apps/api/src/modules/tenancy/application/listeners/membership-user.listener.ts).

### H03 — HIGH — Permission composition is too permissive for reusable resource security

**Source-confirmed.** Beyond C01, several semantics are unsafe to copy into a larger product:

- Ownership grants every action rather than an explicit action set.
- Global user permissions are unioned with tenant-role permissions. A restrictive tenant role cannot remove the broad global notes/files grants.
- files:write matches every files action, including delete.
- Tenant owners receive Object.values(Permissions), automatically inheriting future additions to the global vocabulary.
- Global admin bypasses explicit denies and tenant mismatch. That may be a deliberate platform capability, but it is not an ordinary organization-admin role.
- Tenant mismatch is rejected only when both tenant IDs exist; a missing principal scope is not rejected by the evaluator itself.
- Note updates/deletes load through a query enforcing notes:read; write-specific resource policy is not evaluated in those commands.
- The reference department policy compares possibly missing attributes: undefined equals undefined.

The reference application's broad sharing may be intentional; it is not evidence that every Notes record should be private. The defect is presenting these semantics as generally reusable authorization.

**Fix:** distinguish platform, tenant, and resource capabilities; require applicable scope; make ownership action-specific; evaluate the action being performed against trusted facts. Filter list queries using the same policy model. Keep any platform bypass explicit and auditable.

**Placement:** Must have safe enforcement in core. Custom role administration, permission groups, team hierarchies, and rich relationship graphs are optional.

Evidence: [permissions](../packages/authorization/src/permissions.ts), [evaluator](../packages/authorization/src/evaluator.ts), [note policies](../apps/api/src/modules/notes/application/notes.policies.ts), [note commands](../apps/api/src/modules/notes/application/commands).

### H04 — HIGH — Last-owner and quota invariants are check-then-write races

**Source-confirmed.** RemoveMemberCommand and UpdateMemberCommand count owners before removing/demoting one. Two owners can concurrently observe two owners and each remove/demote an owner, leaving none. An ordinary transaction at the default isolation level does not serialize this invariant.

Upload quota checks similarly sum active bytes and then insert a reservation without serializing competing requests. Concurrent reservations can exceed the quota.

**Fix:** serialize membership ownership changes on the organization row or an equivalent scoped lock, then recheck. Use atomic quota reservations/counters or a lock on the quota owner. Add barrier-based concurrency integration tests. Do not apply distributed locks to every mutation.

**Placement:** Must have an invariant/concurrency pattern in core; particular quota policies are optional.

Evidence: [remove member](../apps/api/src/modules/tenancy/application/commands/remove-member.command.ts), [update member](../apps/api/src/modules/tenancy/application/commands/update-member.command.ts), [request upload](../apps/api/src/modules/files/application/commands/request-upload.command.ts).

### H05 — HIGH — Refresh rotation is not a complete session lifecycle

**Source-confirmed.** The application uses JWTs, an authVersion, and a Redis used-JTI marker. SessionService contains session operations, but login does not create a per-device session and normal authentication does not validate one.

Replay rejects the reused refresh token, but does not revoke its descendant token family. If a thief rotates a stolen refresh token first, the legitimate user's later replay failure does not invalidate the thief's successor. Used-token retention is fixed at seven days while token expiry is configurable. Cookie durations are separately fixed. A missing JTI is tolerated by the refresh path.

Consuming the marker before later lookup/signing work also burns a token on some transient failures. Logout increments the user's global version, which revokes all devices rather than one session. That is valid only if explicitly presented as the product behavior.

**Fix:** choose one documented lifecycle. For a broadly reusable starter, provide a minimal session/family record, hashed refresh credential, atomic rotation, reuse response, device/session revocation, and expiry derived from one configuration source. Define a bounded retry policy for a lost rotation response. Coordinate browser-tab refreshes. Keep JWT key rotation and current authVersion checking.

**Placement:** Must have a correct lifecycle in core. Session management UI should be core; MFA/passkeys/SSO adapters can be optional.

Evidence: [refresh command](../apps/api/src/modules/auth/application/commands/refresh-tokens.command.ts), [login command](../apps/api/src/modules/auth/application/commands/login.command.ts), [session service](../apps/api/src/infrastructure/session/session.service.ts), [cookie configuration](../apps/api/src/modules/auth/presentation/auth.cookies.ts).

### H06 — HIGH — Account emails can be silently lost and queue IDs are invalid

**Source-confirmed.** EmailService.send returns a Result. SendVerificationEmailCommand and ForgotPasswordCommand await it without checking Err. A try/catch does not catch a returned failure. Registration now depends on verification, so lost mail can prevent activation.

Welcome and invitation listeners use custom job IDs containing colons, such as welcome-email:<userId>. BullMQ prohibits colons in custom IDs. The listeners catch enqueue failure and fall back to direct send; a failed Result is logged and swallowed, allowing upstream delivery to appear successful.

**Fix:** persist email intent durably, use valid stable identifiers, and make transient delivery failures retryable. Treat provider acceptance, delivery, bounce, and user-visible completion as different states. Preserve generic responses that avoid exposing account existence.

**Placement:** Must have reliable identity mail in core; marketing/digest campaigns are optional.

Evidence: [verification mail](../apps/api/src/modules/auth/application/commands/send-verification-email.command.ts), [forgot password](../apps/api/src/modules/auth/application/commands/forgot-password.command.ts), [welcome listener](../apps/api/src/modules/users/application/listeners/welcome-email.listener.ts), [invitation listener](../apps/api/src/modules/tenancy/application/listeners/invitation-email.listener.ts). External behavior: [BullMQ job ID rules](https://docs.bullmq.io/guide/jobs/job-ids).

### H07 — HIGH — Email changes do not preserve identity verification invariants

**Source-confirmed.** UpdateUserCommand updates email as an ordinary profile field without resetting verification, proving control of the replacement address, or updating authVersion. It also records the target user as audit actor, because no acting principal is passed.

Email lookup/uniqueness is not consistently normalized across identity and invitation flows. A case-sensitive database uniqueness rule is not a complete identity-address policy.

**Fix:** make email change a dedicated command with recent authentication/administrative authorization, pending-address verification, uniqueness normalization, and explicit session-revocation behavior. Carry the real actor into audit records. Define case handling rather than silently applying incompatible rules.

**Placement:** Must have in the core.

Evidence: [update user](../apps/api/src/modules/users/application/commands/update-user.command.ts), [users persistence](../apps/api/src/modules/users/infrastructure/users.repository.ts), [user schema](../apps/api/src/modules/users/infrastructure/schemas/user.schema.ts).

### H08 — HIGH — Supported browser deployment topologies are not consistently implemented

**Source-confirmed.** The API sets a host-only XSRF-TOKEN cookie. The web client reads document.cookie to create the CSRF header. With the documented app.example.test / api.example.test topology, the web page cannot read the API host's cookie. After a reload, when in-memory bearer credentials are absent, refresh and cookie-authenticated mutations can fail CSRF validation.

SameSite=Strict additionally excludes genuinely cross-site deployments; subdomains on the same site are a separate issue. CORS origin lists and OriginValidationInterceptor also parse CLIENT_URL differently.

**Fix:** define and test one default topology, preferably web and API behind the same origin. If separate origins are supported, implement an explicit CSRF-token bootstrap and a consistent origin allowlist. Do not globally disable CSRF to make deployment work.

**Placement:** Must have in the core.

Evidence: [bootstrap cookie hook](../apps/api/src/main.ts), [CSRF guard](../apps/api/src/common/guards/csrf.guard.ts), [client utilities](../packages/api-client/src/utils.ts), [origin interceptor](../apps/api/src/common/interceptors/origin-validation.interceptor.ts), [production workflow examples](../.github/workflows/cd.yml).

### H09 — HIGH — A presigned upload can replace bytes after validation

**Source-confirmed; object-store reproduction not executed.** The upload URL authorizes PUT to the eventual object key for an hour. Confirmation/scanning evaluates that key, but does not bind approval to an immutable object version or checksum. The still-valid URL can overwrite the key after approval, making subsequent downloads serve unapproved bytes.

The presigned request does not enforce the declared size. HEAD ContentType is client-controlled metadata. With antivirus disabled, metadata checks are not a content scan. With antivirus enabled, scanning an unversioned key does not fix the overwrite race.

**Fix:** upload into quarantine; validate a particular immutable version/checksum; promote or copy to a final non-uploadable key. Enforce actual size and meaningful type checks. Keep transient scanner outages distinguishable from malicious content.

**Placement:** Optional files module, but these guarantees are mandatory when enabled.

Evidence: [upload command](../apps/api/src/modules/files/application/commands/request-upload.command.ts), [S3 driver](../apps/api/src/infrastructure/storage/drivers/s3.driver.ts), [scanner](../apps/api/src/infrastructure/storage/file-scanner.service.ts), [scan worker](../apps/api/src/modules/files/application/workers/file-scan.worker.ts).

### H10 — HIGH — File downloads do not inherit parent-resource authorization

**Source-confirmed/design risk.** GetFileDownloadUrlQuery authorizes files:read against the file, then returns its signed URL. It does not ask the parent domain whether the actor may read the linked business resource. Broad tenant files:read grants can therefore expose an attachment that a future application's parent policy intends to keep private.

The link flow's parent checks are useful but do not protect later independent download requests. Signed download URLs also remain usable until expiry after permissions change.

**Fix:** define file visibility explicitly: uploader-private, tenant-shared, public, or parent-controlled. For parent-controlled objects, call a registered domain access function at download time. Use short-lived URLs appropriate to the data, and avoid shared public CDN URLs for private content.

**Placement:** Optional files module with a small core authorization extension contract.

Evidence: [download query](../apps/api/src/modules/files/application/queries/get-file-download-url.query.ts), [file policies](../apps/api/src/modules/files/application/files.policies.ts), [link command](../apps/api/src/modules/files/application/commands/link-file.command.ts).

### H11 — HIGH — Outbox delivery/replay guarantees are weaker than the state names imply

**Source-confirmed.** The relay marks a row PUBLISHED when it has been enqueued; the worker also marks it PUBLISHED after listener dispatch. Enqueueing and successful processing are different milestones. Listeners can swallow failures, so successful emitAsync is not proof of all required effects.

Deduplication is an event-wide Redis marker. It is neither a durable per-consumer inbox nor atomic with each consumer's writes. A crash after one listener succeeds and before another finishes can duplicate the first listener's effects on retry. Listeners receive only payload, making consistent event-ID deduplication awkward.

Dead-letter requeue changes the SQL row to PENDING, but retries queue.add with the same job ID. If BullMQ retains the failed job, that add does not run it again. The relay can mark the event published while the original failed job remains failed.

**Fix:** document at-least-once delivery, separate dispatch from consumer completion, deliver the envelope including ID, and implement durable per-consumer deduplication where effects require it. Replay must explicitly retry/remove the retained failed job or use a controlled replay identity. Add poison-message, partial-listener, crash, and replay tests.

**Placement:** Must have in core when domain events are advertised as durable.

Evidence: [relay delivery](../apps/api/src/infrastructure/outbox/outbox-relay.delivery.ts), [event worker](../apps/api/src/infrastructure/outbox/outbox-event.worker.ts), [requeue implementation](../apps/api/src/infrastructure/outbox/outbox.repository.ts). [BullMQ duplicate-ID semantics](https://docs.bullmq.io/guide/jobs/job-ids).

### H12 — HIGH — Notifications can be duplicated, lost, or grouped across organizations

**Source-confirmed.** Notification persistence and email/push/realtime delivery are not one recoverable workflow. A crash between them loses a channel send. DigestWorker marks a batch delivered before external delivery; an existing digest row is treated as proof of delivery even if a previous attempt crashed before sending.

The batching flow still executes immediate delivery in SendNotificationCommand, so some configured channels can receive both individual notifications and a digest. Grouping keys omit tenant identity, allowing one user's notifications from multiple organizations to share a batch when type/entity grouping coincides.

Catch-and-requery recovery from a uniqueness violation inside an existing PostgreSQL transaction also requires a savepoint or conflict-safe insert; catching an exception alone does not clear an aborted transaction.

**Fix:** store per-channel delivery intent and state, use a unique event/recipient/channel identity, and retry channels independently. Include tenant in grouping where tenant separation is intended. Make batching suppress the intended immediate channels. Resolve H02 before relying on the digest worker.

**Placement:** Optional notifications module. Shared retry/idempotency primitives belong in core.

Evidence: [send notification](../apps/api/src/modules/notifications/application/commands/send-notification.command.ts), [digest worker](../apps/api/src/modules/notifications/application/workers/digest.worker.ts), [batch repository](../apps/api/src/modules/notifications/infrastructure/batches.repository.ts).

### H13 — HIGH — The local distributed cache is unbounded and caches mutable domain objects

**Source-confirmed.** DistributedCacheService keeps a Map without capacity eviction or periodic expiry cleanup. Expired entries disappear only if that key is read again. A stream of one-time user lookups retains memory.

It stores Result objects containing mutable entities. UpdateUserCommand mutates a cached User before persistence completes. Failure or rollback can leave another request observing the mutated in-memory object. Invalidation inside an outer request transaction can also let a second instance refill stale data before commit. Redis Pub/Sub cannot replay missed invalidations.

**Fix:** bound the cache; cache immutable serialized snapshots; evict expired entries independently of reads; invalidate after successful outer commit; tolerate missed invalidation through versioning/short TTL where appropriate. Keep security decisions on fresh authoritative state.

**Placement:** Should have a safe cache adapter in core; local caching itself is optional.

Evidence: [distributed cache](../apps/api/src/infrastructure/cache/distributed-cache.service.ts), [update command](../apps/api/src/modules/users/application/commands/update-user.command.ts).

### H14 — HIGH — Redis does not reliably recover after an outage

**Source-confirmed.** RedisService stops reconnection after three attempts. An initial connection error disconnects and clears the client. Subscribers initialized while Redis is unavailable are not later recreated through a recovery lifecycle.

A short outage can therefore leave the process permanently degraded until restart. Queue connections use their own configuration, so queue health and the shared RedisService can disagree. The same URL is used for eviction-friendly cache data and durability-sensitive jobs/replay markers.

**Fix:** separate bounded request timeouts from ongoing reconnection with capped jittered backoff. Reestablish subscriptions and reload state after reconnect. Define required versus optional dependency behavior. Permit separate Redis roles/configuration without requiring multiple clusters for small projects.

**Placement:** Must have correct recovery in core when Redis supports auth/jobs.

Evidence: [RedisService](../apps/api/src/infrastructure/redis/redis.service.ts), [queue service](../apps/api/src/infrastructure/queue/queue.service.ts), [feature flags](../apps/api/src/infrastructure/feature-flags/feature-flags.service.ts).

### H15 — HIGH — HTTP idempotency can confuse resources and cannot protect durable business mutations

**Reproduced/source-confirmed.** The fingerprint uses the route template rather than the resolved resource path and omits path/query parameters. DELETE /notes/one and DELETE /notes/two produce the same fingerprint when the route template is /notes/:id.

Redis claim/finalization is not atomic with the SQL mutation. A process crash after commit but before recording the response can execute a retry twice. Oversized responses and finalization failures also weaken replay guarantees. A recovered claim lacks a unique lease-owner/fencing identity, so an older request can interfere with a newer claim using the same fingerprint.

**Fix:** include canonical method/path parameters/query/body in the request identity. For important mutations, record operation ID, request hash, outcome, and domain changes in the same database transaction. Use Redis as an optimization, with nonce ownership and bounded leases where needed. Clients must retain an operation key across user/network retries.

**Placement:** Must have a documented durable idempotency pattern in core; not every endpoint requires it.

Evidence: [fingerprint](../apps/api/src/common/utils/idempotency.utils.ts), [idempotency interceptor](../apps/api/src/common/interceptors/idempotency.interceptor.ts), [API client](../packages/api-client/src/index.ts).

### H16 — HIGH — Realtime authorization and transport wiring are incomplete

**Source-confirmed.** WebSocket authentication validates credentials and membership at connection time, but has no token-expiry timer or membership-change revalidation. Removing a membership does not disconnect that tenant's existing socket. Global auth events can disconnect users, but Pub/Sub delivery is not a durable revocation guarantee.

The raw ws gateway declares a CORS option without an explicit Origin check. Browser WebSockets need server-side Origin validation; this is not supplied merely by an HTTP CORS configuration. The documented /ws route also cannot receive access cookies whose Path is /api. Browser clients cannot supply an arbitrary Authorization header through the standard WebSocket constructor.

SSE is marked TenantAgnostic and registers the user with no tenant. Tenant-addressed messages use a different connection key, so that channel does not deliver those tenant messages through the current SSE subscription.

Connection caps and stream recovery are valuable, but no explicit slow-client buffered-byte policy or meaningful message-size budget is configured at the gateway.

**Fix:** select and test a consistent browser transport/authentication path, validate Origin, bind subscriptions to authorized scope, close/revalidate on expiry and membership revocation, and bound send buffers. Treat realtime as a hint to refetch durable state unless a replay protocol is explicitly implemented.

**Placement:** Optional realtime module; its authorization contract is core.

Evidence: [WebSocket gateway](../apps/api/src/infrastructure/realtime/transports/realtime-websocket.gateway.ts), [SSE controller](../apps/api/src/infrastructure/realtime/transports/realtime-sse.controller.ts), [realtime auth listener](../apps/api/src/infrastructure/realtime/listeners/realtime-auth.listener.ts), [connection dispatcher](../apps/api/src/infrastructure/realtime/connections/realtime-connection.dispatcher.ts), [cookies](../apps/api/src/modules/auth/presentation/auth.cookies.ts).

### H17 — HIGH — Protected SSR routes do not have request-scoped authentication

**Source-confirmed; concurrent browser/SSR test required.** The protected route's beforeLoad rejects only an already unauthenticated store. Initial status is loading; actual /auth/me bootstrap happens in a browser effect. Child loaders can run first.

The API client and auth/locale/tenant stores are module singletons. Server loaders do not forward the incoming request's cookies through a request-bound client. A server request can therefore fail authentication and mutate shared process auth state. Future server code that populates this store with a user would create cross-request identity risk.

getRouter creates a per-request QueryClient, which is correct, but the root QueryProvider independently creates another server QueryClient. This complicates consistent loader hydration.

**Fix:** choose an explicit model within TanStack Start: request-scoped server authentication/client/query context resolved before protected loaders, or deliberately client-only protected data loading. Do not leave an accidental hybrid. Use one QueryClient per server request throughout loader/render/hydration.

**Placement:** Must have in the core.

Evidence: [protected route](../apps/web/src/routes/_app.tsx), [API singleton](../apps/web/src/lib/api.ts), [router](../apps/web/src/router.tsx), [query provider](../apps/web/src/lib/query-client.tsx), [root route](../apps/web/src/routes/__root.tsx).

### H18 — HIGH — Identity changes do not consistently clear client data

**Source-confirmed/design risk.** Mobile onAuthFailure clears the auth store without cancelling/clearing QueryClient or resetting tenant state. Query identities generally include a tenant where applicable, but do not consistently include the user; notifications/privacy have user-specific data behind generic keys.

After account A expires and account B signs in within the same running mobile process, cached personal data or late responses can survive into B's UI. Regular sign-out cleanup does not cover every authentication-failure path. The web failure handler performs a full-page redirect, which mitigates that particular path; it does not establish a universal identity-transition contract.

Tenant query keys and request headers are also derived separately from mutable global state. A retry/in-flight operation needs a captured scope, not whatever tenant is selected later.

**Fix:** centralize identity transitions: cancel outstanding work, clear private cache/state, reset active tenant, and establish the new identity. Scope private query keys to principal and tenant, and bind query functions to the same immutable scope. Test account replacement, expiry, tab sync, and rapid tenant switching.

**Placement:** Must have in the core; mobile itself remains optional.

Evidence: [mobile API lifecycle](../apps/mobile/src/lib/api.ts), [mobile stores](../apps/mobile/src/stores), [web API lifecycle](../apps/web/src/lib/api.ts), [query keys](../apps/web/src/lib/query-keys.ts), [client options](../packages/api-client/src/index.ts).

### H19 — HIGH — The web quality gate does not typecheck the application

**Reproduced.** apps/web/tsconfig.json has files: [] and project references. Running tsc --noEmit on that solution file does not build/check the referenced projects. Both web typecheck and build use that command.

The direct application check reported 69 diagnostics. These include paths such as /_app/notes/$noteId where navigation expects /notes/$noteId, missing typed search parameters, incompatible upload-body arguments, and stale test types. The production bundler still succeeds because it transpiles these files.

Existing E2E scaffolding also contains a definite token-extraction bug: xsrf.split("=", 1)[1] is always undefined. Its authenticated refresh request sends an empty CSRF header. This is separate from not being able to run Docker locally.

**Fix:** typecheck both referenced projects explicitly or use the correct TypeScript build-mode setup, repair the diagnostics, and make CI fail on the actual application. Fix the E2E fixture and add a real boot smoke, not just more unit mocks.

**Placement:** Must have in the core.

Evidence: [web tsconfig](../apps/web/tsconfig.json), [web scripts](../apps/web/package.json), [API E2E fixture](../apps/api/src/app.e2e.test.ts).

### H20 — HIGH — The production migration service resolves the wrong directory

**Source-confirmed.** The Docker image runs from /app. migrate.ts resolves ../../migrations/pg from process.cwd, which becomes /migrations/pg. The migration service invokes the compiled script without changing its working directory. The image also relies on Turbo's pruned output rather than explicitly packaging the root migration directory at that location.

The service forwards DATABASE_URL but not DB_DIRECT_URL, although the migration runner correctly supports a direct connection for advisory locks. The documented pooler topology can therefore route migrations through the wrong connection.

**Fix:** package migration artifacts explicitly, resolve from a stable configured/module location, pass the migration connection and role, and test the exact built image against an empty and an upgraded database. Keep the existing single-client advisory lock.

**Placement:** Must have in the core.

Evidence: [migration runner](../apps/api/src/infrastructure/database/migrate.ts), [Dockerfile](../Dockerfile), [production compose](../docker/docker-compose.prod.yml).

### H21 — HIGH — The advertised deployment/rollback command does not select published images

**Source-confirmed.** CD publishes SHA-tagged images, but production Compose defines build entries rather than image references using TAG. The documented TAG=<sha> command does not select those artifacts, and changing TAG does not implement rollback.

CD runs independently on push to main, without a dependency on the CI workflow's success. Images, including latest, are pushed before Trivy scans. A failing scan or failing CI can therefore leave a published latest artifact. The deploy job is explicitly an example that validates configuration and prints commands; it does not deploy.

**Fix:** promote an immutable image digest only after checks and scans pass; make Compose consume that exact artifact. Provide a working staging deployment, readiness verification, previous-artifact rollback, and an explicit migration compatibility policy.

**Placement:** Must have one working reference path in core. A specific cloud platform or Kubernetes is optional.

Evidence: [CD](../.github/workflows/cd.yml), [Compose](../docker/docker-compose.prod.yml), [operations instructions](../docs/PRODUCTION_OPS.md).

### H22 — HIGH — Proxy, TLS, readiness, and shutdown settings do not form a safe rollout

**Source-confirmed.**

- The no-certificate Nginx entrypoint tries to replace default.conf, which Compose mounts read-only. That fallback cannot perform its intended rewrite.
- Port 80 serves the application directly. An internet-facing deployment needs a deliberate redirect/TLS-termination policy; missing certificates must not silently create an unintended plaintext login surface.
- TRUST_PROXY=true trusts arbitrary forwarding hops, while Nginx appends to the incoming X-Forwarded-For chain. Client-supplied addresses can affect backend IP controls. Nginx's own source-IP limit provides some mitigation, not a correct backend trust boundary.
- Compose uses API liveness as its health/dependency gate. Readiness exists but is not what this reference rollout waits for.
- DatabaseService closes its pool in OnModuleDestroy. QueueService drains workers later in BeforeApplicationShutdown. Installed Nest lifecycle code confirms that destroy hooks run first. Active jobs may need a database that is already closing.
- QueueService closes queues before workers; active workers can still need to enqueue work. The fixed five-second pause does not mark the process unready or implement a bounded coordinated drain.

**Fix:** render runtime Nginx configuration into a writable location, define TLS mode explicitly, trust only known proxy hops, gate on readiness, stop admission/polling first, drain jobs/requests with deadlines, and close shared dependencies last.

**Placement:** Must have in core deployment/lifecycle infrastructure.

Evidence: [Nginx entrypoint](../docker/nginx-entrypoint.sh), [Nginx config](../docker/nginx.conf), [Compose](../docker/docker-compose.prod.yml), [database lifecycle](../apps/api/src/infrastructure/database/database.service.ts), [queue lifecycle](../apps/api/src/infrastructure/queue/queue.service.ts), [shutdown service](../apps/api/src/infrastructure/health/shutdown.service.ts).

### H23 — HIGH — Dependency advisories and runtime packaging need remediation

**Verified advisory matches, not a demonstrated public-server exploit.** pnpm audit reported:

| Locked dependency | Finding                                                     | Context                                                                        |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| next 16.3.0       | Two CRITICAL RCE advisories; patched range starts at 16.3.3 | Reached through the email preview tooling, not the TanStack application server |
| js-yaml 4.3.1     | HIGH CPU-exhaustion advisory; patched range starts at 4.3.2 | Reached through commitlint/cosmiconfig tooling                                 |

The Next advisories have specific Windows-server and image-optimization prerequisites. This audit did not establish those vulnerable endpoints as deployed. Nevertheless, the lockfile fails the repository's high-severity audit gate. Docker copies the installer workspace with development dependencies into the runner; prune the runtime artifact and inspect its actual dependency inventory.

Node 22 remains a supported line at this review date, but CI/Docker pin 22.12.0 while the workspace permits Node 20. Node 20 is EOL. Align supported, patched runtimes and avoid a permissive engine declaration that admits unsupported deployment versions.

**Fix:** update affected dependency paths within the locked stack, verify the resolved lockfile, produce a production-only artifact/SBOM, and enforce patch ownership. Do not globally override unrelated majors without compatibility tests.

**Placement:** Must have in the core maintenance/release process.

Sources: [Windows-hosted Next advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [Next AVIF advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [js-yaml advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [Node release status](https://nodejs.org/en/about/previous-releases). Repository evidence: [lockfile](../pnpm-lock.yaml), [email package](../packages/email/package.json), [Dockerfile](../Dockerfile), [root package](../package.json).

### H24 — HIGH — Privacy completion can hide partial work or permanently skip data

**Source-confirmed.** Account erasure enumerates only the first 100 organizations. Later organizations are not purged by that loop. Some dependency failures become empty collections during export, yet the export is marked READY. Exports cap selected collections and have a truncation flag, which is useful, but dependency failure and completeness are not represented consistently.

The nightly erasure worker handles 25 requests, continues after some errors inside one outer transaction, and ignores several Results from hard deletion, request-state updates, and event dispatch. A request can be counted fulfilled without proving its steps succeeded.

The privacy controllers are TenantAgnostic while organization erasure requires a tenant-role permission. The ordinary owner's tenant role is absent at the coarse guard; the application-level owner check is correct in intent but cannot make that guard usable.

**Fix:** keyset-page all relevant memberships; give each lifecycle request durable step state; fail or explicitly label partial exports; process independent requests in independent bounded transactions; check every required Result. Make tenant erasure authorization use a trusted resolved organization scope.

**Placement:** Optional privacy module, with core lifecycle/error conventions.

Evidence: [account erasure](../apps/api/src/modules/privacy/application/commands/request-account-erasure.command.ts), [export](../apps/api/src/modules/privacy/application/commands/request-export.command.ts), [purge worker](../apps/api/src/modules/privacy/application/commands/purge-expired-erasures.command.ts), [privacy controller](../apps/api/src/modules/privacy/presentation/privacy.controller.ts).

### H25 — HIGH — Rate limiting adds attacker-controlled state and runs after expensive guards

**Source-confirmed.** The Redis sliding-window log adds every attempted request, including rejected requests. Its size is bounded by time, not by admitted request count, so a burst can create large sorted sets.

RateLimitGuard runs after auth, tenant resolution, and permissions. Invalid authentication can incur work without reaching this limiter. The Redis-unavailable metric labels series with the raw rate-limit key, including variable client identities. This can cause high-cardinality metric growth precisely during an outage. checkByTenant exists but is not the global guard's tenant fairness policy.

**Fix:** use a bounded counter/token-bucket/sliding-window implementation, limit unauthenticated traffic before expensive work, then apply principal/tenant/operation budgets. Use bounded metric labels. Specify which endpoints fail closed when Redis is unavailable. Test proxy trust with the limiter.

**Placement:** Must have in the core.

Evidence: [rate limiter](../apps/api/src/infrastructure/rate-limit/rate-limit.service.ts), [guard](../apps/api/src/common/guards/rate-limit.guard.ts), [guard order](../apps/api/src/app.module.ts).

### M01 — MEDIUM — Notes removal is not an independent module operation

**Source-confirmed.** Privacy directly imports Notes queries/purge commands. Shared permissions/ownership vocabulary, file parent types, event payload registration, frontend routes/navigation/dashboard, migration verification, and the single-to-multi migration script know about Notes.

Removing only NotesModule leaves imports, registrations, UI, and checks behind. project:init deliberately retains the example and asks the adopter to replace multiple surfaces. Retaining a reference is reasonable; requiring manual edits to generic lifecycle infrastructure is not.

**Fix:** maintain a complete reference edition plus a tested minimal edition. Let optional modules register file access, lifecycle contributors, navigation, and event contracts through explicit composition. Do not invent a dynamic plugin loader. Before first release, generate a fresh baseline for the minimal edition; never rewrite migrations already applied by downstream projects.

**Placement:** Must have removability/explicit composition in core; Notes should be an optional example.

Evidence: [project initialization](../scripts/initialize-project.js), [new-project guide](../docs/STARTING_A_NEW_PROJECT.md), [privacy module](../apps/api/src/modules/privacy/privacy.module.ts), [migration checks](../apps/api/src/infrastructure/database/migration-check.ts), [tenant conversion](../scripts/migrate-to-multi-tenant.ts), [event schemas](../packages/contracts/src/schemas/outbox.schema.ts).

### M02 — MEDIUM — Central barrels, global providers, and persistence abstractions will become coordination bottlenecks

The backend has useful boundaries, but many modules are global and depend directly on concrete exported command/query classes. The dependency rule prevents cross-module table imports; it does not make all implementation dependencies explicit.

The generic repositories use repeated unknown-to-structural-type casts and a broad CRUD/filter abstraction, weakening the Drizzle type guarantees. Database access can fall back to an unscoped handle. The rules requiring every type, including private implementation shapes, in one contracts package conflict with numerous existing local types and encourage a large shared dependency surface.

**Fix:** keep concrete code where it is simple. Export small stable module APIs at actual cross-team boundaries; keep tables private and writes explicit. Retain contracts for externally shared/wire shapes, organize them by domain with subpath exports, and discuss a rule amendment for private implementation types rather than silently violating the locked rules. Avoid making every trivial command an interface hierarchy.

**Placement:** Should have in core architecture conventions.

Evidence: [dependency rules](../.dependency-cruiser.cjs), [base repository](../apps/api/src/infrastructure/database/repositories/base.repository.ts), [base read repository](../apps/api/src/infrastructure/database/repositories/base-read.repository.ts), [contracts](../packages/contracts/src), [module composition](../apps/api/src/app.module.ts).

### M03 — MEDIUM — Dual transport presentation creates avoidable drift

oRPC controllers often inject and call REST controller methods. This reuses code, but transports now depend on each other rather than a shared application-facing function. Direct method calls do not execute the called controller's Nest decorators/pipes/guards; the oRPC contract and its own metadata must independently cover everything.

Parity tests provide useful coverage, but source/metadata parity is weaker than exercising both wire formats. API version v1 exists, while event version is largely a positive integer with hardcoded version 1 in delivery; unknown event topics accept an arbitrary record. There is no implemented event upcasting/unsupported-version policy.

**Fix:** put shared request orchestration in a small presentation mapper/application adapter and keep transport adapters thin. Generate/test contract behavior once. Retain REST where consumers need it, rather than automatically maintaining two bespoke controllers per internal feature. Version persisted event schemas by topic and version, with explicit rejection/migration rules.

**Placement:** Must have stable contract/version policy in core; a second transport is optional.

Evidence: [users oRPC controller](../apps/api/src/modules/users/presentation/users.orpc.controller.ts), [oRPC infrastructure](../apps/api/src/infrastructure/orpc), [event schema](../packages/contracts/src/schemas/outbox.schema.ts), [API docs](../apps/api/src/infrastructure/api-docs/api-docs.ts).

### M04 — MEDIUM — Some bounded workers never progress through the whole dataset

The file reconciler repeatedly selects LIMIT 100 uploaded rows without a cursor/last-checked ordering. Healthy early rows can be selected indefinitely while later drift remains unchecked. Daily cleanup and erasure batch limits have no drain-to-completion budget; at sustained intake above the batch rate, retention promises fail.

The relay claims ten events every five seconds and delivers sequentially: approximately two events/second per relay before work time, with worse throughput when a tick is skipped. API instances and workers each add their own pool budget. Default workers have no exposed per-queue concurrency/timeout policy. Piscina caps threads but does not configure a bounded submission queue.

**Fix:** use progressing cursors, bounded drain loops, age-based backlog alerts, configurable worker concurrency, and explicit maximum execution/admission budgets. Size total database connections across all roles. Do not equate a LIMIT with scalable processing.

**Placement:** Must have bounded-work conventions in core; worker-specific schedules remain modular.

Evidence: [file repository](../apps/api/src/modules/files/infrastructure/files.repository.ts), [reconciliation worker](../apps/api/src/modules/files/application/workers/file-reconciliation.worker.ts), [relay worker](../apps/api/src/infrastructure/outbox/outbox-relay.worker.ts), [queue service](../apps/api/src/infrastructure/queue/queue.service.ts), [CPU workers](../apps/api/src/infrastructure/workers/piscina.service.ts).

### M05 — MEDIUM — Transaction duration and database evolution need stronger conventions

Every ordinary HTTP handler defaults to one transaction. Authentication/membership work can occur before it, and transaction setup executes eight sequential set_config statements. External I/O inside a handler can keep a connection/locks occupied. Under load, pool occupancy and transaction duration matter more than whether each SQL query is individually fast.

The initial migration contains indexes and RLS, but no foreign-key declarations were found in the inspected migration/module schemas. Module encapsulation does not forbid database constraints. Missing constraints need an explicit consistency/reconciliation alternative, especially within a module. There is also no general version/compare-and-swap convention for lost-update-sensitive business aggregates.

Offset pagination with total counts is a reasonable small-list default; it is not the default for very large activity feeds or exports. Domain joins/reporting should use explicit read models rather than loops of cross-module GetById calls.

**Fix:** keep RLS context correct while shortening units of work; consolidate setup where possible; add appropriate constraints; provide optimistic concurrency and keyset pagination examples. Freeze released migrations and test upgrades from a populated previous release. db:migrate:status currently runs drizzle-kit check, which does not establish the deployed database's migration status.

**Placement:** Must have conventions and safe migration tooling in core; specialized read models/replicas belong to applications.

Evidence: [database service](../apps/api/src/infrastructure/database/database.service.ts), [transaction interceptor](../apps/api/src/common/interceptors/database-transaction.interceptor.ts), [baseline SQL](../migrations/pg/0000_initial.sql), [migration checker](../apps/api/src/infrastructure/database/migration-check.ts), [API scripts](../apps/api/package.json).

### M06 — MEDIUM — Observability has blind spots in the paths most likely to fail

Structured logs, metrics, traces, dashboards, and runbooks exist. However:

- Queue spans start without a propagated parent trace carrier; outbox envelopes omit standard actor/correlation/causation metadata.
- MetricsInterceptor records on every emitted value, so SSE can decrement an active-connection gauge repeatedly. Cancellation/completion needs finalize-style accounting.
- Guards run before the metrics interceptor, leaving denied traffic incompletely represented.
- The worker heartbeat proves a timer is alive, not that each queue/cron is making progress.
- Readiness monitors SQL outbox PENDING count, not all queued/stalled/dead-letter work.
- Slow-query instrumentation wraps pool.query, while transactions use acquired clients; it is not complete transaction query instrumentation.
- Error reports omit headers/bodies, which is good, but arbitrary exception messages/stacks and logged database errors still need redaction before external delivery.

**Fix:** correlate request -> transaction -> event -> job -> provider, measure oldest work age and successful progress, separate SSE metrics, and verify an alert reaches a human in staging. Business metrics should be supplied by each application.

**Placement:** Must have operational telemetry in core; vendor-specific exporters/dashboards are optional.

Evidence: [metrics interceptor](../apps/api/src/infrastructure/metrics/metrics.interceptor.ts), [queue tracing](../apps/api/src/infrastructure/queue/queue.service.ts), [worker heartbeat](../apps/api/src/infrastructure/workers/worker-health.service.ts), [readiness](../apps/api/src/infrastructure/health/health.service.ts), [error reporter](../apps/api/src/infrastructure/error-reporting/error-reporter.service.ts).

### M07 — MEDIUM — Audit records are useful activity logs, not a complete trustworthy audit trail

AuditListener is an asynchronous observer and catches write failures. Critical mutations can commit without a durable audit record. H01 can additionally produce an audit record before the mutation commits. Several commands infer actor from the target; membership administration is not uniformly audited. Ordinary CRUD snapshots do not capture every authentication, access, or privileged-control event.

RLS and retention are valuable, but do not establish immutability, legal hold, or restricted audit-writer privileges. Historical audit/outbox payloads can retain names, emails, and invitation tokens after profile anonymization.

**Fix:** write required security/admin audit facts atomically with the operation, using an allowlisted payload and real actor/subject distinction. Separate immutable business history from mutable user profiles and optional activity feeds. Add append-only/retention controls according to the product's requirements.

**Placement:** Should have baseline security/admin auditing in core; regulated immutable journals and access history are optional, application-governed capabilities.

Evidence: [audit listener](../apps/api/src/infrastructure/audit/audit.listener.ts), [audit retention](../apps/api/src/infrastructure/audit/audit-retention.worker.ts), [user update audit](../apps/api/src/modules/users/application/commands/update-user.command.ts), [outbox payloads](../packages/contracts/src/schemas/outbox.schema.ts).

### M08 — MEDIUM — Restore tooling verifies a database file, not application recovery

Backup/restore scripts exist and have safeguards. Restore verification checks archive integrity, SQL success, SELECT 1, and the presence of tables. It does not verify representative business rows, RLS roles/policies, cross-store references, object bytes, or queue replay after restoration.

**Fix:** define RPO/RTO per deployment; restore a populated fixture into isolation; verify row counts/invariants, migration state, credentials/roles, and a representative download/login. Document object-store versioning/backup and Redis recovery/replay policy. Add off-host encrypted backup storage and periodic restore drills in the deployment environment.

**Placement:** Must have a recovery contract/reference drill in core. Backup service/vendor and retention duration are project operations choices.

Evidence: [backup](../scripts/db-backup.sh), [restore verification](../scripts/db-restore-verify.sh), [operations guide](../docs/PRODUCTION_OPS.md).

### M09 — MEDIUM — Production configuration and scaling examples are incomplete

The production Compose file does not forward several advertised optional telemetry/feature/push settings; the worker omits RESEND_API_KEY while accepting EMAIL_DRIVER. Fixed container_name entries prevent ordinary Compose service scaling. Resource budgets and a tested shutdown grace period are absent. The pooler profile needs its TLS/client/direct-migration topology verified, not just YAML parsing.

**Fix:** use a validated configuration matrix shared by API/worker roles, forward enabled adapter settings, remove fixed names where replicas are supported, and publish one measured small-production sizing example. Test the enabled profiles end to end.

**Placement:** Must have one correct reference deployment in core; multiple production platforms are optional.

Evidence: [production Compose](../docker/docker-compose.prod.yml), [pooler entrypoint](../docker/pgbouncer-entrypoint.sh), [environment configuration](../apps/api/src/config/env.ts).

### M10 — MEDIUM — The frontend is a usable UI base but not yet a complete application shell

There are real forms, tables, pagination, dialogs, themes, responsive primitives, and error states. The missing reusable pieces are authorization-aware navigation/actions, organization onboarding/switching/member administration, consistent identity lifecycle, and a proven SSR model.

The global users page checks admin status in the UI, while other navigation visibility is not a permission model. This is UX only; backend checks must remain the security boundary. Normal users also cannot use the current own-avatar endpoints because they require users:write.

Localization is substantial, but locale preference is not consistently carried into background delivery; mobile validation can show raw Zod messages; RTL direction/layout is not wired as a complete capability. The presence of Base UI/Storybook does not prove keyboard, focus, screen-reader, contrast, or native accessibility compliance.

**Fix:** add a small permission-aware shell, organization UX when that module is enabled, a shared form-error mapping, and direction-aware tokens/layout. Verify representative screens with keyboard/screen-reader/automated accessibility tests. Keep complex business tables and dashboards project-specific.

**Placement:** Should have shell/primitives in core; organization UX and mobile are optional modules.

Evidence: [web features](../apps/web/src/features), [web routes](../apps/web/src/routes), [user endpoints](../apps/api/src/modules/users/presentation/users.controller.ts), [mobile features](../apps/mobile/src/features), [i18n](../packages/i18n), [UI](../packages/ui).

### M11 — MEDIUM — The handwritten WAF is brittle for general-purpose business content

The global scanner treats ordinary words such as SELECT, UPDATE, CREATE, plus characters such as #, as SQL-injection indicators. Legitimate search/business text can match these rules. NoSQL patterns are carried into a PostgreSQL stack. String scanning is not a substitute for parameterized SQL or contextual output encoding.

Its Nest middleware uses Fastify reply assumptions; the raw middleware adapter's rejection path also deserves an actual integration test. Body scanning cannot be assumed to run at the desired parse stage merely from its TypeScript type.

**Fix:** remove broad business-content keyword rejection; retain proven schema/body/header limits and parameterized queries. Put any edge WAF rules in the deployment with tested exceptions and false-positive monitoring.

**Placement:** Basic request hardening must be core; a custom application WAF should not be mandatory boilerplate.

Evidence: [WAF patterns](../apps/api/src/infrastructure/waf/waf.patterns.ts), [middleware](../apps/api/src/infrastructure/waf/waf.middleware.ts), [global registration](../apps/api/src/infrastructure/waf/waf.module.ts).

### M12 — MEDIUM — Generators and rules can propagate unsafe examples at scale

The feature generator emits update/delete commands that load and mutate records without resource-action authorization, relying on the coarse controller permission. Its generated events/audit flow inherits the transaction problems. The generator smoke test transpiles/checks text, rather than compiling and exercising the complete generated module in an application.

Many quality rules pass while runtime provider omissions, private type-placement inconsistencies, and authorization gaps remain. Strict file/function limits are not a substitute for behavioral invariants.

**Fix:** generate a temporary complete project/slice, typecheck it, boot it, exercise both transports and tenant/ownership failures, and test removal of the example. Amend rules where they conflict with maintainable code through an explicit repository decision; do not silently bypass them.

**Placement:** Should have reliable generators in core tooling; generating every screen/domain pattern is optional.

Evidence: [application generator](../scripts/generators/application.generator.js), [presentation generator](../scripts/generators/presentation.generator.js), [generator smoke](../scripts/generators/generator-smoke.js), [rule checker](../scripts/check-rules.js).

### L01 — LOW — Dependency and package hygiene need cleanup

The lockfile marks tsconfck 3.1.6 as unmaintained and includes deprecated esbuild-kit helpers, an older glob, and a DOMException polyfill. These are transitive maintenance signals, not proof that a deployed endpoint is vulnerable.

Mobile imports shared API-client/i18n packages that are not declared in its own dependencies; hoisting can conceal this and break pruning/isolated builds. Standardize package ownership and update the parents of deprecated dependencies. The native/web Tailwind split is platform-specific and does not, by itself, justify consolidation.

**Placement:** Should have dependency hygiene in core tooling. Evidence: [lockfile](../pnpm-lock.yaml), [mobile manifest](../apps/mobile/package.json), [mobile API](../apps/mobile/src/lib/api.ts).

### L02 — LOW — Brand initialization and build budgets could be more explicit

project:init updates important metadata but deliberately leaves the reference domain and some labels. A starter adoption should produce a consistent application identity, not a mixture of environment app names and translated default names.

The measured web build includes a main client JavaScript chunk around 336 kB (107 kB gzip) and CSS around 220 kB (32 kB gzip), plus other chunks. Route splitting is present. These are build measurements, not a complete first-load transfer or Core Web Vitals result. Set budgets and inspect dependency contributions before adding hundreds of screens.

**Placement:** Should have lightweight initialization/budgets in core tooling.

Evidence: [initializer](../scripts/initialize-project.js), [web app](../apps/web), [design tokens](../packages/design-tokens).

## Capability completeness and placement

“Present” means implementation was found, not that the preceding defects disappear. An optional missing capability is not a release blocker unless the starter promises or enables it.

| Capability                                           | Actual baseline                                                   | Recommended placement                                    | Reason / necessary work                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Local authentication                                 | Password login, registration, verification, reset                 | **Must have in the core**                                | Correct session and recovery lifecycle before release                                                                  |
| Session inventory and per-device revocation          | Session service scaffolding; not integrated into login/auth       | **Must have in the core**                                | A user must be able to revoke a stolen device without ambiguous global logout semantics                                |
| Safe email change and reauthentication               | Ordinary profile email update; password confirmation in erasure   | **Must have in the core**                                | Identity changes must prove control and carry actor identity                                                           |
| MFA/passkeys                                         | No implemented end-to-end flow found                              | **Optional module/plugin**                               | Keep step-up/auth-method extension points in core; privileged production projects should enable appropriate protection |
| OAuth/OIDC/enterprise SSO                            | No provider/account-linking flow found                            | **Optional module/plugin**                               | Provider choice, linking, and enterprise policy vary; avoid shipping all providers                                     |
| User profile and minimal administration              | User CRUD, profile/avatar integration                             | **Should have in the core**                              | Split self-service from privileged administration and correct permissions                                              |
| Principal/permission enforcement                     | Shared evaluator and Nest guards                                  | **Must have in the core**                                | Fix trusted facts, action specificity, scope, and deny behavior                                                        |
| Basic static RBAC                                    | Global and tenant role maps                                       | **Must have in the core**                                | Provide safe defaults without requiring a policy-administration product                                                |
| Custom roles and permission groups                   | No persisted administration model found                           | **Optional module/plugin**                               | Useful for ERP/SaaS; not required for every small application                                                          |
| ABAC and ownership predicates                        | Callback policies and owner inference                             | **Should have in the core**                              | Small typed policy hooks are sufficient; no arbitrary policy language required                                         |
| Relationship graphs, branch/team hierarchy           | No full relationship store or hierarchy                           | **Optional module/plugin**                               | Resource relationships are domain-specific                                                                             |
| Platform administration                              | Global admin bypass                                               | **Should have in the core**                              | Explicit, scoped/audited platform capability; do not confuse it with organization admin                                |
| API keys/service principals                          | No implemented lifecycle found                                    | **Optional module/plugin**                               | Add hashed credentials, scopes, rotation, expiry, auditing when integrations need them                                 |
| Tenant context and isolation contracts               | CLS, repositories, RLS, mode configuration                        | **Must have in the core**                                | Expensive to retrofit after many domains are built                                                                     |
| Organizations/memberships/invitations                | Backend implementation, partial UI                                | **Optional module/plugin**                               | Single-tenant applications should not carry organization product UX                                                    |
| Organization switching/onboarding UI                 | Tenant store/invitation acceptance; no complete management flow   | **Optional module/plugin**                               | Required when the organization module is enabled                                                                       |
| Tenant-aware cache/job/event/file/audit keys         | Partly implemented                                                | **Must have in the core**                                | Provide scope helpers and tests; module-specific payloads remain local                                                 |
| Typed API contracts and validation                   | Zod/oRPC and output schemas                                       | **Must have in the core**                                | One stable error/request/response contract; ensure all wire paths enforce it                                           |
| API versioning and OpenAPI                           | v1 paths and generated development docs                           | **Must have in the core**                                | Define breaking-change and client compatibility process                                                                |
| Pagination/filter/sort primitives                    | Bounded page pagination; feature-specific queries                 | **Should have in the core**                              | Add keyset example and allowlisted filters; avoid a universal public query language                                    |
| Request IDs and consistent error envelopes           | Implemented                                                       | **Must have in the core**                                | Cover early guards/plugins and preserve machine-readable codes                                                         |
| Rate limits/body/time limits                         | Present, with defects                                             | **Must have in the core**                                | Bound admission and dependency work; make tenant fairness configurable                                                 |
| CORS/CSRF/cookies/security headers                   | Present, topology mismatch                                        | **Must have in the core**                                | Supported browser topology must work end to end                                                                        |
| File malware/type/quota controls                     | Metadata checks and optional AV path                              | **Optional module/plugin**                               | Mandatory safeguards inside an enabled file module                                                                     |
| Secret configuration and key rotation                | Validated env, secret-file loading, JWT key rings                 | **Must have in the core**                                | Support external secret delivery and documented rotation; no secret-management product needed                          |
| TLS and encryption at rest                           | Production TLS requirements/config; no universal field encryption | **Must have in the core** for deployment contract        | DB/object/backup encryption is deployment responsibility; verify it                                                    |
| Field-level encryption/KMS workflows                 | No general implementation found                                   | **Optional module/plugin**                               | Encrypt selected sensitive fields; no blanket encryption abstraction for every value                                   |
| Database pooling/transactions/migrations             | Implemented, integration defects                                  | **Must have in the core**                                | Correct transaction ownership, role separation, and tested migration artifact                                          |
| Concurrency/idempotency pattern                      | Transactions and Redis request dedupe                             | **Must have in the core**                                | Include an atomic business invariant and durable operation example                                                     |
| Soft deletion/lifecycle hooks                        | Soft deletion and purge workers                                   | **Should have in the core**                              | Opt in per aggregate; do not force soft deletion or hard deletion everywhere                                           |
| Caching                                              | Redis cache plus local cache                                      | **Should have in the core**                              | Small bounded adapter; no requirement to cache every query                                                             |
| Durable jobs/retries/DLQ                             | BullMQ/outbox implemented                                         | **Should have in the core**                              | Identity mail and external effects need a proven mechanism; workers can be disabled in minimal profiles                |
| Domain event persistence                             | Transactional outbox implemented                                  | **Should have in the core**                              | Keep small and at-least-once; durable consumer idempotency where needed                                                |
| Scheduled jobs                                       | Nest Cron workers                                                 | **Should have in the core**                              | Provide overlap, claim, progress, retry, and shutdown conventions                                                      |
| CPU worker pools                                     | Piscina wrapper                                                   | **Optional module/plugin**                               | Only needed for CPU-heavy tasks; enforce bounded queueing when enabled                                                 |
| File/object storage                                  | S3-compatible adapter and metadata module                         | **Optional module/plugin**                               | Reusable but unnecessary for products without uploads                                                                  |
| Transactional email                                  | SMTP/Resend adapters and templates                                | **Must have in the core** for local-account edition      | Verification/recovery depend on it; provider remains replaceable                                                       |
| In-app/email/push notifications                      | Rich implementation with reliability gaps                         | **Optional module/plugin**                               | Channel preferences/digests are product features, not mandatory infrastructure                                         |
| Basic search                                         | Feature queries; no complete general search service               | **Should have in the core** as conventions               | Provide scoped, paginated database search example                                                                      |
| Advanced/full-text/faceted search                    | No dedicated general search subsystem found                       | **Optional module/plugin**                               | Choose from real relevance/volume needs; do not mandate a separate search cluster                                      |
| Audit trail                                          | Asynchronous mutation/denial records and retention                | **Should have in the core**                              | Durable security/admin facts, actor/subject/context, redaction                                                         |
| Activity feeds/access history                        | Partial mutation/notification history                             | **Optional module/plugin**                               | Distinct retention/query semantics from audit logs                                                                     |
| Feature flags                                        | Env flags and Redis overrides                                     | **Should have in the core**                              | Simple safe defaults; flags are not authorization                                                                      |
| Targeting/experimentation platform                   | Context accepted but no complete targeting engine                 | **Optional module/plugin**                               | Rollouts/cohorts/audited management only when needed                                                                   |
| Logs/request correlation/metrics/traces              | Implemented                                                       | **Must have in the core**                                | Complete async propagation, progress signals, bounded cardinality                                                      |
| Error tracking integration                           | Generic HTTP collector plus logs                                  | **Should have in the core**                              | Keep the provider-neutral boundary and strengthen redaction                                                            |
| Health/readiness/liveness                            | Implemented                                                       | **Must have in the core**                                | Wire them to deployment and shutdown correctly                                                                         |
| Operational dashboards/alerts                        | Prometheus/Grafana/Loki/trace examples and runbooks               | **Should have in the core**                              | A small working default is enough; vendor selection remains optional                                                   |
| Backup/restore/RPO/RTO                               | Scripts and CI restore smoke                                      | **Must have in the core** as a reference contract        | Verify full application recovery, not just table presence                                                              |
| Subject export/deletion                              | Implemented privacy module                                        | **Optional module/plugin**                               | Core must expose safe domain lifecycle contributors                                                                    |
| Consent/legal hold/retention policies                | No complete domain policy model found                             | **Optional module/plugin**                               | Policies depend on application and jurisdiction                                                                        |
| Immutable business records                           | No general business ledger                                        | **Should NOT belong in the boilerplate** as domain logic | Provide identity/history conventions, not accounting/legal rules                                                       |
| Bulk import/export                                   | Subject export only                                               | **Optional module/plugin**                               | Large imports need staging, validation, resumability, per-row errors, CSV safety                                       |
| Webhooks                                             | No general inbound/outbound lifecycle found                       | **Optional module/plugin**                               | Build signatures, replay protection, delivery logs, retries, endpoint safety when required                             |
| External integrations                                | Email/storage/push adapters; no business connectors               | **Optional module/plugin**                               | Keep timeouts/retry/idempotency conventions in core                                                                    |
| WebSockets/SSE                                       | Implemented                                                       | **Optional module/plugin**                               | Fix scope/revocation/backpressure before enabling                                                                      |
| Frontend routing/query/forms/errors/themes           | Implemented                                                       | **Must have in the core**                                | Repair SSR/auth/cache integration                                                                                      |
| Tables/dialogs/toasts/loading/empty states           | Shared primitives/features exist                                  | **Should have in the core**                              | Keep composable primitives; no universal screen builder                                                                |
| Accessibility/i18n/direction                         | i18n/primitives present; RTL and verification incomplete          | **Must have in the core** as baseline conventions        | Avoid expensive retrofits; product-specific compliance needs extra testing                                             |
| Mobile application                                   | Expo implementation                                               | **Optional module/plugin**                               | Web-only adopters should not need mobile build/tooling                                                                 |
| CI/lint/tests/format/typecheck/secret scan           | Present                                                           | **Must have in the core**                                | Repair false gates and add boundary/failure tests                                                                      |
| Docker/reference staging/production                  | Present but not end-to-end reliable                               | **Must have in the core**                                | One deployable, observable, recoverable path is sufficient                                                             |
| Dependency upgrades/starter releases                 | Dependabot, lockfile, Changesets tooling                          | **Must have in the core** as a process                   | Publish upgrade guidance/security backports for downstream forks                                                       |
| Kubernetes/service mesh/microservices                | Not required by current architecture                              | **Should NOT belong in the boilerplate** by default      | Adopt only for measured deployment/ownership constraints                                                               |
| Billing, ERP ledger, CRM pipeline, workflow designer | No general product implementation                                 | **Should NOT belong in the boilerplate**                 | These are application domains; reusable examples/plugins can be separate                                               |

## Architecture, authorization, and tenancy assessment

### Boundaries and dependency direction

The modular monolith is the right deployment/ownership model for this goal. The module directories and no-cross-table-import policy are useful. The application layer currently depends on concrete infrastructure and Nest decorators, so it is pragmatic layered code rather than a completely persistence-independent domain model. That alone is not a reason to rewrite it.

The serious boundary problem is that guarantees depend on invisible ambient state: optional database/authorization dependencies, a global transaction interceptor, CLS tenant state, SQL connection-local settings, and asynchronous listeners. Each piece can pass its own test while their combination changes security or atomicity. Make these invariants explicit before introducing more abstractions.

Prefer a stable exported use-case API over importing another module's repository. Allow a transaction to encompass multiple module calls when one business invariant actually requires atomicity. Do not force all cross-module communication through events; use events for after-commit effects and independent workflows, not to obscure synchronous invariants.

### Authorization capability assessment

| Requirement                      | Current assessment                                | Recommended boundary                                             |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Roles/action permissions         | Static role maps exist; unsafe composition        | Explicit namespace and scope per action                          |
| Permission groups/custom roles   | Not implemented as persisted administration       | Optional module on top of the core evaluator                     |
| Resource access/ownership        | Present but overbroad; request facts untrusted    | Load facts in application code, then authorize exact action      |
| Organization permissions         | Membership role resolution exists                 | Require principal tenant and policy scope to match               |
| Branch/team permissions          | No complete hierarchy                             | Application/optional module supplies attributes/relations        |
| ABAC/context-aware rules         | Callback hooks exist                              | Validate required attributes; missing values deny                |
| Super-admin                      | Global bypass exists                              | Explicit platform capability, audit, step-up where appropriate   |
| Service-to-service               | No service identity lifecycle                     | Optional credential module, same authorization boundary          |
| Frontend enforcement             | Some role-based routing; incomplete permission UX | UX only; never an independent security boundary                  |
| List/search/export authorization | Feature-specific filters                          | Apply scope/visibility in the query, not only after loading rows |

A secure generic evaluator does not require an external policy server. It does require tested semantics and trusted input. Start with explicit static policies; add dynamic role storage when a product needs it.

### Multi-tenancy decision

**Tenant awareness belongs in the foundation; organizations as a product feature should be optional.**

The current shared-table design can remain. The mode must be a deployment setting, and every enabled module needs to declare whether its data is global, tenant-owned, or subject-owned. Subject-wide notifications/export can be legitimate, but cross-organization aggregation must be deliberate and must not accidentally bypass a project's separation requirements.

Required invariants:

1. Every request/job obtains a trusted principal and scope.
2. No tenant-owned query runs without scope, except an explicit audited system operation.
3. Scope changes either open a new unit of work or update the active transaction through one controlled API.
4. RLS is exercised using the actual restricted application role.
5. Cache keys, dedupe keys, batch grouping, file keys, and events use the same scope identity.
6. Membership removal/role changes affect long-lived subscriptions as well as the next HTTP request.
7. Multi-organization enumeration is paginated to completion for lifecycle work.

Do not add schema-per-tenant/database-per-tenant engines now. Document an escape hatch for residency/large-isolated-customer requirements and keep module APIs independent of a particular tenant topology.

### Maintainability as the codebase grows

| Scale                      | Likely pressure                                                                                                    | What to change before reaching it                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Around 10K LOC             | Composition defects, unsafe reference patterns, manual setup                                                       | Fix boot/auth/transactions and make the reference slice trustworthy                                                       |
| Around 100K LOC            | Central permission/contracts barrels, duplicate transports, module registration churn, broad integration test gaps | Domain subpath exports, stable public module APIs, generated composition checks, owner-based test responsibility          |
| 500K+ LOC / multiple teams | Cross-domain reporting, large migrations, lifecycle orchestration, event compatibility, downstream fork upgrades   | Explicit read models, bounded jobs, event/version ownership, expand/contract releases, platform-owned compatibility tests |

LOC does not by itself justify microservices. Extract a service only when independent scaling, ownership, deployment, or isolation has a measured benefit that exceeds distributed-system costs.

## Security assessment beyond the main findings

| Threat area           | Evidence-based assessment                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password storage      | Argon2 is a sound existing choice. Benchmark cost and concurrency on the actual container; bound credential input and avoid account-existence timing differences where feasible.                                                                 |
| Reset/verification    | Hashed tokens, expiry, and atomic consumption are good. Delivery reliability and the email-change lifecycle need repair.                                                                                                                         |
| Brute force           | Rate limits and account lockout exist; guard order, spoofable proxy identity, Redis outage behavior, and memory bounds need tests.                                                                                                               |
| SQL injection         | Inspected persistence uses parameterized SQL/Drizzle. No specific exploitable SQL concatenation path was established. This does not justify the broad keyword WAF.                                                                               |
| XSS                   | Inspected normal text rendering benefits from React escaping. No specific stored-XSS exploit was established. The web HTML response needs a tested CSP, and any future rich-text/HTML rendering needs a sanitization contract.                   |
| CSRF/CORS             | Real controls exist. Cross-origin cookie bootstrap and inconsistent origin parsing make supported configurations unreliable. Raw WebSockets need separate Origin enforcement.                                                                    |
| IDOR/BOLA             | C01 is a concrete broken authorization boundary. Parent-file access, action-specific checks, and list visibility also need negative tests. UUIDs are identifiers, not authorization.                                                             |
| SSRF                  | No arbitrary end-user fetch-URL sink was established in the inspected current flows. Operator-configured provider URLs are a different trust boundary. Future webhook/import URL features need destination validation and network egress policy. |
| Secrets               | Validated env and secret-file support exist. No claim is made that deployed secrets, history, or external secret stores were fully scanned here; CI has Gitleaks.                                                                                |
| Data exposure         | Mutable caches, client identity transitions, event/audit payload retention, file visibility, and async error-message redaction are the concrete concerns.                                                                                        |
| Privileged operations | Separate self-service/admin endpoints, actor/subject identity, reauthentication, durable audit, and optional MFA are needed before high-value administration.                                                                                    |
| Encryption            | Transport requirements and key rings exist. Object/database/backup encryption and access policies must be verified in the actual deployment; no blanket claim of encrypted business fields is warranted.                                         |

## Reliability and failure behavior

| Failure/trigger                    | Current likely behavior from inspected paths                                                                    | Required production behavior                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Database unavailable               | Pool/statement timeouts and errors exist; readiness can fail                                                    | Bounded admission, clear retryability, no misleading successful cache/side effects   |
| Redis absent at startup            | Shared client is disabled; some auth requests fail closed, other limits fail open; queues have separate clients | Explicit required/optional mode; recovery without manual restart; coherent readiness |
| Redis fails during operation       | Reconnect eventually stops; invalidations/revocation messages may be missed                                     | Ongoing reconnection, state reconciliation, bounded request failures                 |
| Queue unavailable                  | Outbox can retain/retry dispatch, but some listeners fall back and swallow failure                              | Durable intent remains pending; no successful-delivery claim until correct milestone |
| Email provider unavailable         | Verification/reset can ignore Err; notification sends can be lost                                               | Retryable intent, bounded attempts/backoff, DLQ/operator visibility                  |
| Storage unavailable                | Adapter returns errors; erasure may already have deleted earlier objects                                        | Checkpointed partial state and idempotent resume                                     |
| AV service unavailable             | Scan failure can mark a valid upload failed                                                                     | Quarantine plus transient retry; never mark unscanned content clean                  |
| External API hangs                 | Some timeout/circuit-breaker helpers exist; not a uniform adapter contract                                      | Deadline, cancellation, bounded retries, idempotency, concurrency budget             |
| Crash after SQL commit             | Redis idempotency result/cache/event side effects may be incomplete                                             | Durable operation/outbox record supports safe retry/replay                           |
| Crash mid-notification             | In-app row/batch state may exist without channel delivery                                                       | Per-channel durable state and dedupe                                                 |
| Duplicate event/job                | Partial Redis/BullMQ dedupe; listeners can repeat effects                                                       | At-least-once contract with durable consumer-specific idempotency                    |
| Poison message                     | Retry/DLQ exists; replay can collide with retained failed job                                                   | Observable quarantine and tested explicit replay                                     |
| Concurrent ownership changes       | Count-then-write can remove every owner                                                                         | Serialized invariant                                                                 |
| Tenant membership revoked          | Next HTTP membership check helps; existing socket remains                                                       | Immediate or bounded revalidation/disconnect                                         |
| Deployment during jobs             | Database teardown precedes worker drain                                                                         | Stop admission, drain/recover jobs, close dependencies last                          |
| Slow realtime client               | Connection caps exist, but no explicit buffered-byte ceiling                                                    | Backpressure/drop/disconnect policy and client refetch                               |
| Growing maintenance backlog        | Fixed small batches can miss progress or fall behind                                                            | Cursor progression, bounded draining, oldest-age alert                               |
| Restore from yesterday's DB backup | Scripts restore SQL; cross-store/job consistency is unspecified                                                 | Known RPO/RTO and a tested cross-store reconciliation procedure                      |

Do not promise exactly-once external effects. Achieve effectively-once business outcomes through durable identity, transactional state changes, and idempotent provider operations where available.

## Frontend and API suitability

The web structure can support many screens if feature modules own their query options, mutations, components, and route wiring. Keep Zustand for small client state and TanStack Query for server state. Avoid a global business store or a universal configurable page engine.

Repair the auth/SSR/query lifecycle first. Then standardize permission-aware actions, URL-backed table filters/pagination, localized validation/errors, empty/loading states, and accessibility. Propagate cancellation from query functions into fetch/upload operations; current wrappers do not establish an end-to-end timeout/cancellation policy.

Current API infrastructure is broader than a basic REST skeleton: typed contracts, oRPC, compatibility REST, OpenAPI, error mapping, validation, pagination, and idempotency hooks are present. Its main gap is consistency across boundaries. Early Fastify/plugin errors, guard failures, and long-lived transports should be tested against the promised error envelope and limits.

Use v1 as an explicit compatibility surface. Add contract-diff tests and consumer fixtures for breaking changes. Keep filtering/sorting allowlisted and module-owned. Bulk APIs, public API keys, webhooks, and large exports should be optional features that reuse the same authentication, tenant, operation-ID, and telemetry contracts.

## Testing strategy needed for v1.0

The current unit-test investment is useful. The missing confidence is concentrated in compositions that mocks cannot validate.

| Test layer                | Keep / add                                           | Essential cases                                                                                   |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unit                      | Keep existing suites, improve negative policy cases  | Missing attributes, action-specific ownership, actor/subject differences, Result failures         |
| Module composition        | Add real Nest graph smoke                            | API and worker; single and multi modes; optional modules disabled                                 |
| Database integration      | Expand with restricted PostgreSQL role               | RLS reads/writes, raw repository escape paths, tenant changes, outbox atomicity, rollback         |
| Concurrency               | Add deterministic barriers                           | Last-owner changes, quota reservations, refresh rotation, duplicate operation IDs                 |
| Auth/API security         | Exercise HTTP with actual guards/pipes               | Forged ownerId, BOLA, verification/reset, CSRF, proxy headers, both transports                    |
| Queue/event integration   | Use real Redis/BullMQ                                | Invalid IDs, retries/backoff, crash recovery, partial consumers, retained failed-job replay       |
| Files                     | Object-store integration and scanner stub            | Overwrite after scan, actual size/type, parent access, purge partial failure                      |
| Frontend                  | Unit/component plus browser E2E                      | SSR reload, account A-to-B transition, concurrent tabs, tenant switching, inaccessible navigation |
| Mobile                    | Keep unit tests, add lifecycle/component integration | SecureStore hydration, auth expiry, account switching, upload interruption, native accessibility  |
| Contracts                 | Add executed compatibility fixtures                  | Wire errors/statuses, invalid outputs, old event versions, stable client behavior                 |
| Lifecycle/governance      | Add populated, multi-tenant fixtures                 | More than 100 memberships, partial export, retention backlog, legal-hold extension                |
| Deployment                | Boot exact immutable images                          | Migrations, no-cert/TLS mode, readiness, shutdown during a job, worker progress                   |
| Recovery                  | Restore populated data                               | Subject/profile/history separation, object references, replay after rollback/restore              |
| Performance               | Add a small reproducible baseline                    | Pool saturation, queue intake/drain, large cursor page, slow WS client, login CPU pressure        |
| Accessibility             | Automate representative checks plus manual review    | Focus, dialogs, keyboard tables, screen readers, theme contrast, RTL                              |
| Generator/minimal edition | Build and run generated output                       | Semantic typecheck, tenant/permission tests, no-Notes edition                                     |

Do not pursue coverage percentage as the primary target. A handful of real boundary/crash tests would have caught several release blockers that hundreds of passing mocks did not.

CI already provisions database/Redis and calls integration/E2E/restore/build checks. Repair and prove that pipeline, make it a required merge/release gate, and ensure CD cannot publish/promote a failing revision.

## Dependency sustainability and upgrade strategy

The chosen stack can support the intended applications. The irreversible risks are coupling and release discipline, not a demonstrated need to replace Nest, PostgreSQL, Drizzle, TanStack, React, or BullMQ.

| Dependency boundary         | Risk                                                                               | Maintenance approach                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Nest/Fastify/plugins        | Bootstrap/decorator/lifecycle semantics differ from TypeScript types               | Real application boot and transport tests on upgrades                                 |
| Drizzle/PostgreSQL/RLS      | SQL settings and migrations are correctness-critical; casts weaken static checking | Pin/test compatible versions, restricted-role integration, populated upgrade fixtures |
| oRPC/Zod/client             | Shared schemas affect server, web, mobile, docs                                    | Contract diff and previous-client compatibility tests; avoid duplicated adapters      |
| TanStack Start/Router/React | Routing/SSR/hydration assumptions are central                                      | Typed route checks and SSR/browser E2E before promotion                               |
| Expo/React Native           | Platform version matrix and native APIs                                            | Keep optional, use supported aligned versions and isolated build checks               |
| BullMQ/ioredis              | Retry, lock, job-ID, and reconnect semantics matter                                | Real queue failure/replay tests, explicit job contract versioning                     |
| S3/email/push providers     | Provider delivery/error/idempotency semantics differ                               | Keep existing adapters small; test a shared behavioral contract                       |
| OTel/metrics/logging        | Cross-package version and instrumentation changes                                  | Verify trace continuity and sample redaction/metric cardinality                       |
| Development toolchain       | Large transitive surface, deprecated packages, hoisting                            | Update parent dependencies, prune runtime, declare workspace dependencies explicitly  |

Do not describe every old transitive dependency as a production vulnerability. Track advisory reachability, owner, patched version, and urgency separately from general modernization.

For downstream forks, tag starter releases, publish a compatibility/migration guide, keep security patches easy to cherry-pick, and maintain at least one small downstream fixture. A generic Changesets installation is not itself a fork-upgrade strategy. Stabilize public module and contract boundaries before copying the starter into many products.

## Data governance model

Profile deletion and business-record deletion are different operations. A CRM contact's personal fields may be erasable while an invoice or approval record must remain historically accurate. The starter must not decide that every row or attachment created by a deleted user disappears.

Use stable subject identifiers, mutable identity/profile records, and application-owned historical snapshots with declared retention purposes. A lifecycle contributor should report what it exports, anonymizes, deletes, retains, or blocks under hold. Record the policy/version and execution state. Do not place arbitrary personal data into every event/audit payload.

Core should provide actor/subject/scope metadata, safe external-effect processing, lifecycle hooks, data classification/redaction conventions, and an audit contract. Optional governance features can provide DSR queues, consent records, legal holds, access history, and retention administration. The product supplies retention periods, immutable business-record rules, and any jurisdiction-specific policy.

Account anonymization must include a documented inventory of logs, audit records, event payloads, files, exports, replicas, and backups. Backup deletion typically follows a separate retention/restore procedure; restored data must reapply completed erasure restrictions before serving users. This report is an architectural assessment, not a certification of legal compliance.

## Architecture scorecard

Scores assess the audited implementation, not the intended architecture. They are engineering judgments, not measured certification scores. A production-readiness score is constrained by release blockers; it is not the average of the other rows.

| Category              | Score / 10 | Explanation                                                                                                                                               |
| --------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture          |          5 | Good modular layering and import rules; hidden ambient transaction/scope assumptions and global coupling undermine guarantees                             |
| Security              |          2 | Sound primitives exist, but reproduced authorization bypass and untrusted ownership are release blockers                                                  |
| Authentication        |          4 | Argon2, verification, reset, key rings, and authVersion are useful; session families, safe email change, and reliable mail are incomplete                 |
| Authorization         |          2 | Shared evaluator and backend guards exist; trust boundary and permission composition are unsafe                                                           |
| Database              |          5 | PostgreSQL/RLS/indexes/transactions provide a strong base; scope mismatch, callback timing, races, and migration packaging need repair                    |
| Scalability           |          4 | Stateless API intent and worker separation are useful; cache growth, low relay throughput, pool occupancy, and fixed maintenance batches constrain growth |
| Reliability           |          3 | Retries/outbox exist, but partial effects, swallowed Results, Redis recovery, and shutdown can lose or misreport work                                     |
| Performance           |          5 | Pagination, route splitting, timeouts, and load shedding exist; no load evidence, avoidable transaction overhead, and incomplete backpressure             |
| Background jobs       |          4 | BullMQ/cron/worker roles are real; invalid IDs, replay semantics, progress health, and lifecycle correctness are unproven/broken                          |
| Event architecture    |          4 | Transactional outbox and SQL claims are valuable; consumer idempotency, event versioning, correlation, and completion states are incomplete               |
| Frontend architecture |          5 | Strong primitives/feature organization; SSR authentication, identity cache lifecycle, typing, permissions, and tenant UX need work                        |
| API design            |          6 | Typed contracts, version paths, errors, docs, and validation are substantial; transport duplication and durable idempotency weaken consistency            |
| Testing               |          5 | Large passing unit suite and CI scaffolding; important runtime/negative/concurrency boundaries escape detection and web typechecking is ineffective       |
| Observability         |          6 | Logs/traces/metrics/dashboards/runbooks exist; async trace continuity, progress health, audit durability, and metric correctness need repair              |
| DevOps                |          3 | Good tooling intent; invalid deployment/rollback instructions, migration path, TLS fallback, and lifecycle prevent confidence                             |
| Developer experience  |          6 | Rules, scripts, generators, docs, Storybook, and tests aid onboarding; false gates and untested generated/deployed behavior waste developer time          |
| Maintainability       |          5 | Small modules and conventions help; central registries, casts, duplicated presentation, and mismatched contracts create long-term friction                |
| Reusability           |          5 | Much infrastructure is generic; Notes removal, opinionated deletion, permission defaults, and shell assumptions still leak                                |
| Extensibility         |          6 | Existing adapters and module layout support additions; stable public APIs/lifecycle contributors/composition tests are needed                             |
| Production readiness  |          2 | Current module graph cannot boot and serious security/data-integrity defects remain                                                                       |

## What will hurt later if left unchanged

| Horizon                 | Plausible failure                                                               | Root cause                                                 | Prevention                                                            |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| First deployment        | API does not start; migrations cannot find files                                | Untested graph and image working directory                 | Boot exact release artifact in CI/staging                             |
| First security incident | Ordinary user changes privileged account identity                               | Ownership taken from request body                          | Trusted resource authorization and negative HTTP tests                |
| Six months              | Restart required after short Redis outage; users cannot recover accounts        | Reconnect lifecycle and lost email intent                  | Durable delivery, explicit dependency recovery                        |
| Six months              | Memory/pool pressure under normal growth                                        | Unbounded local cache and long ambient transactions        | Capacity limits, immutable cache values, short scoped units of work   |
| One year                | Duplicate sends/imports/business operations after retry                         | Redis markers mistaken for durable idempotency             | Operation records and per-consumer dedupe                             |
| One year                | Ownerless tenant or quota overrun under concurrency                             | Check-then-write invariants                                | Serialized/atomic updates with concurrency tests                      |
| One year                | Deletion reported complete while data remains or attachments vanish on rollback | Cross-store lifecycle and scope mismatches                 | Checkpointed jobs and application retention policies                  |
| Multiple projects       | Every security fix requires bespoke changes in every fork                       | Unstable shared boundaries and no release/backport process | Versioned starter releases, minimal edition, downstream fixture       |
| Three years             | Teams cannot evolve event payloads or central contracts independently           | Global registries and no persisted version policy          | Domain ownership, subpath APIs, compatible event evolution            |
| Large deployment        | Backlog grows even with healthy processes                                       | Low claim rate, fixed batch caps, timer-only health        | Intake/drain metrics, oldest-age alerts, configurable bounded workers |

These are concrete consequences of the findings, not a prediction that every deployment will experience all of them.

## Recommended final architecture

### Core foundation versus optional features

Keep a single repository and modular backend, with an API process and a separately scalable worker process sharing code. Keep PostgreSQL as the source of truth and the existing Redis/BullMQ adapters. Use explicit compile-time module composition.

```text
apps/
  api/src/
    main.ts                         # API bootstrap and HTTP lifecycle
    worker.ts                       # worker bootstrap/lifecycle, or equivalent role entry
    app.module.ts                   # explicit enabled-module composition
    common/                         # transport guards, envelopes, request adapters
    infrastructure/
      configuration/                # validated role-specific config and secret loading
      database/                     # scoped unit of work, roles, migrations, pool health
      authorization/                # trusted policy evaluation, decision audit
      logger/ metrics/ tracing/     # bounded telemetry, async context propagation
      health/                       # readiness, liveness, draining state
      cache/ redis/                 # bounded caches and recovery lifecycle
      outbox/ queue/                # durable dispatch, retries, replay, job contracts
      audit/                        # durable security/admin facts
      email/                        # identity mail intent and provider adapters
      storage/ realtime/ workers/   # enabled only when a module needs them
    modules/
      users/                        # global identity/profile, actor-aware administration
      auth/                         # credentials, sessions, verification/recovery
      tenancy/                      # OPTIONAL organizations/memberships/invitations
      files/                        # OPTIONAL quarantine, metadata, parent access
      notifications/                # OPTIONAL inbox/channel delivery/preferences
      privacy/                      # OPTIONAL lifecycle orchestration/contributors
      notes/                        # OPTIONAL reference slice
      <project-domain>/             # ERP/CRM/workflow/etc.; same module boundaries
  web/src/
    routes/                         # thin route adapters, request-scoped auth
    features/
      auth/ users/                  # core identity experience
      tenancy/ files/ notifications/ # optional feature UI
      <project-domain>/
    components/                     # shell, navigation, generic presentation
    lib/                            # scoped API/query context, errors, localization
    stores/                         # small client-only state
  mobile/                           # OPTIONAL Expo application
packages/
  contracts/src/<domain>/            # shared wire/event contracts and stable exports
  authorization/                    # pure policy vocabulary/evaluator contracts
  api-client/                       # generated/typed transport + scoped options
  i18n/                             # shared locales/error keys
  ui/                               # domain-free primitives and composed UI patterns
  design-tokens/
  email/                            # templates; preview tooling stays development-only
  typescript-config/
migrations/pg/                      # immutable released migrations
docker/                             # working local/staging/production reference
scripts/                            # init/generator/migration/recovery tooling
docs/
  adr/ runbooks/                     # decisions, operations, starter release guides
```

This tree describes responsibilities, not a requirement to create every new directory or rename working files. Keep existing locations where they already express the same responsibility. Changes to repository placement/type rules should be agreed explicitly before implementation.

### Backend execution model

```text
Request
  -> early bounded admission
  -> authenticated principal
  -> trusted tenant/membership resolution
  -> coarse capability gate
  -> application use case
       -> load trusted resource facts
       -> authorize the exact action
       -> short scoped database unit of work
            domain writes + required audit + operation record + outbox
       -> commit
       -> best-effort cache invalidation
  -> validated response / localized error envelope

Outbox
  -> bounded relay claim
  -> versioned job envelope
  -> worker establishes trusted scope
  -> per-consumer idempotent transaction
  -> external delivery intent
  -> retry / completion / dead-letter / explicit replay
```

Use synchronous cross-module calls for invariants that must be atomic. Use durable events for independently retried effects. Keep controllers focused on transport mapping. Keep repositories module-owned. Do not introduce a generic repository language that becomes the application's actual domain API.

### Authentication architecture

Retain local credentials as the default edition, Argon2, hashed single-use recovery tokens, key rings, issuer/audience validation, and Secure/HttpOnly browser cookies.

Add one authoritative session/family lifecycle with atomic refresh rotation, expiry, revocation, reuse handling, and recent-authentication context. A platform principal contains identity/session data; an organization principal adds membership/scope. Do not infer organization privileges from global user roles.

Local password auth, OIDC, MFA, and service credentials should converge on the same principal contract. Providers and account-linking rules remain optional. Web credentials use the tested cookie topology; mobile uses SecureStore. Neither client decides authorization.

### Authorization architecture

Use a small evaluator over trusted principal, action, resource descriptor, and context. Explicit policies decide ownership/attributes; missing required attributes deny. Scope checking cannot be bypassed by an ordinary role union. List queries receive a policy-derived visibility constraint.

The frontend may consume capabilities for menus/buttons, but the application use case rechecks them. Platform administration is an explicit capability with audit and appropriate step-up, not a silent universal branch inside every business role check.

Keep policy declarations close to the owning domain, with shared public shapes in contracts/authorization according to the repository's agreed rules. Add custom-role persistence only when needed.

### Database architecture

Use one logical PostgreSQL database with module-owned schemas/tables. Bind scope and transaction through one unit-of-work API. Use a restricted application role, a separate migration role, and carefully controlled system operations. RLS is defense in depth alongside explicit repository predicates.

Prefer constraints and atomic SQL for invariants. Add optimistic versions to aggregates that need lost-update detection. Use offset pagination for small lists and keyset pagination for large feeds/exports. Add explicit reporting read models when cross-domain query requirements emerge; do not expose private tables throughout the application.

Migrations are immutable after release. Use expand/backfill/contract changes compatible with overlapping deployments. Test populated N-1 upgrades and define forward recovery for data migrations; do not promise a universal SQL down migration.

### Jobs and events

Keep the transactional outbox and BullMQ, with a worker composition that loads only required consumers. Every durable job has schema/version, tenant or global scope, actor where meaningful, event/operation ID, correlation/causation IDs, attempt metadata, and a bounded execution policy.

Persist business state and consumer-dedupe state together. Classify failures as retryable/permanent; cap attempts and backoff with jitter where appropriate. Monitor oldest age, stalled jobs, retries, DLQ, and successful progress. Replay is an audited action with known duplicate semantics.

Cron should enqueue/claim durable work, not perform an unlimited cross-store workflow on a timer. Use database claims or a well-defined lease for multi-worker coordination. Add ordering only for aggregates that require it; global total ordering is unnecessary.

### Frontend architecture

Use one request-scoped auth/API/query context for SSR, or explicitly disable SSR data loading in the protected tree. Use one QueryClient per request/browser and cancel/clear on identity transitions. Bind each query to a principal/tenant snapshot.

Keep feature-owned query options/mutations/forms/components and thin routes. Provide a small shell with permission-aware navigation, accessible dialogs/toasts/errors, tables with URL state, design tokens, theme, localization, and direction support. Module composition selects optional navigation and routes. Avoid domain-specific content in shared UI.

### Observability architecture

Preserve Pino, OpenTelemetry, Prometheus, dashboards, and runbooks. Standardize request/trace/event/job IDs, redaction, bounded labels, queue-age metrics, and dependency recovery events. Separate security audit from diagnostic logs and product activity.

Readiness must reflect admission/draining state and critical dependency usability. Worker health must prove progress across enabled responsibilities. A staging exercise should demonstrate: trigger failure -> alert -> trace/log lookup -> runbook -> recovery verification.

### Testing and DevOps architecture

Keep Vitest/Playwright and the current CI structure. Add real graph/database/queue/security boundary tests, semantic generator checks, a minimal no-Notes edition, and one downstream compatibility fixture.

Build production-only immutable images; scan before promotion; use the same digest in staging and production. Package/run migrations independently with a direct connection. Use readiness-gated rollout and bounded coordinated shutdown. Document TLS/proxy mode and secret delivery. Restore populated fixtures and periodically rehearse deployment rollback and cross-store recovery.

No cloud control plane, service mesh, universal plugin marketplace, or microservice framework is required for this architecture.

## Remediation plan and v1.0 release gates

### Gate 1: establish a trustworthy executable baseline

Fix C02 and H19. The actual API/worker module graphs must boot in both modes; the web application and generated features must be typechecked. Establish a required CI gate and keep an auditable record of the checks run against the release revision.

### Gate 2: close security and integrity defects

Fix C01, H01–H08, H15, H25, and the relevant deployment identity/proxy controls. Prove negative authorization, atomic rollback, tenant scope, last-owner concurrency, refresh reuse, mail failures, and durable duplicate handling.

Fix C03/H24 before shipping erasure. Fix H09/H10 before shipping files; H11/H12 before relying on durable notifications/events; H16 before enabling realtime. If an optional feature cannot meet its guarantees, omit it from the v1.0 edition rather than keeping a misleading enabled implementation.

### Gate 3: make failures recoverable

Fix Redis recovery, cache safety, bounded workers, trace continuity, audit reliability, and lifecycle shutdown. Run failure injection with database/Redis/provider outages and process termination between mutation and effect.

### Gate 4: deploy and restore the release artifact

Fix H20–H23 and M08/M09. Deploy exact images to staging, run migrations against a populated prior release, verify TLS/proxy/cookie behavior, readiness, worker progress, and rollback. Restore representative data and objects within a declared RPO/RTO.

### Gate 5: prove starter reusability

Generate a minimal project with Notes absent, then add a small unrelated domain using the generator. It must build, boot, migrate, authenticate, authorize, process a durable effect, and render a localized screen without editing generic privacy/storage/security infrastructure.

For an organization-enabled edition, also prove onboarding, switching, membership administration, tenant-isolated queries/jobs/files, and revocation. Publish a starter release guide and upgrade/backport policy.

These are acceptance gates, not calendar estimates. More feature count does not compensate for a failed gate.

## What to remove or simplify

- Remove the broad SQL/NoSQL keyword WAF as a mandatory business-content filter.
- Remove unsafe optional authorization/transaction fallbacks from production use cases; tests should provide real required dependencies or faithful fixtures.
- Remove the implication that an ownership match grants every action.
- Remove duplicated transport orchestration; retain compatible adapters only where needed.
- Remove mutable domain entities from shared caches.
- Remove direct external effects from long database transactions.
- Remove Notes-specific imports from generic lifecycle/storage/security composition.
- Remove unused session/worker abstractions from the minimal edition unless they are wired and tested.
- Remove development-only tooling from runtime images.
- Remove universal deletion assumptions and claims of exactly-once visibility that the implementation does not establish.

Do not add a generic workflow engine, dynamic policy language, accounting model, plugin marketplace, service mesh, multi-database abstraction, or mandatory Kubernetes deployment merely to make the starter appear enterprise-ready.

## Direct answers to the ten final questions

1. **Is this actually a good general-purpose production starter?** It is a promising and substantial starter foundation, but the audited revision is not production-ready. Its breadth exceeds its verified integration quality.
2. **Would I confidently start a serious SaaS/ERP/CRM on it?** I would use it as a remediation base with explicit release gates. I would not ship or broadly fork this revision as a trusted foundation.
3. **What is most missing?** Correct integrated session/authorization/lifecycle guarantees, a working immutable deployment/rollback path, meaningful boundary/concurrency tests, a tested minimal edition, and complete organization UX when enabled.
4. **What are the biggest architectural risks?** Ambient scope/transaction state, untrusted authorization facts, cross-store effects inside transactions, event-wide transient dedupe, mutable/global caches, and centralized cross-domain registries.
5. **What must be fixed before v1.0?** All core security/startup/integrity blockers, false quality gates, durable delivery/idempotency semantics, Redis/shutdown recovery, and actual image migration/deployment/restore. Enabled optional modules must meet the same safety standard.
6. **What should not be added?** Premature microservices/Kubernetes, a universal business workflow/ERP/CRM engine, arbitrary policy DSLs, every SSO/integration provider, mandatory search clusters, and blanket compliance business rules.
7. **What will hurt at large scale?** Pool occupancy, cache/cardinality growth, low/unstable worker throughput, incomplete lifecycle pagination, central contracts/permissions churn, transport duplication, and migration/fork upgrade coordination.
8. **What should become reusable core infrastructure?** Trusted request/job scope, action-specific authorization, session lifecycle, scoped transactions, durable operation/outbox/audit records, bounded retries/admission/cache behavior, telemetry, contract testing, and a working deployment/recovery reference.
9. **What should be optional?** Organizations, custom roles/groups/teams, MFA/SSO providers, files, notification channels/digests, realtime, advanced search, webhooks/integrations, bulk imports/exports, governance workflows, CPU pools, and mobile.
10. **What should be redesigned now?** Authorization trust inputs, transaction/scope ownership, cross-store lifecycle workflows, session families, durable consumer/idempotency semantics, protected SSR/client identity state, and module composition/removal. These become expensive to change after multiple products depend on them.

## Reproduction notes for the four isolated proofs

These proofs exercised existing methods without a live service:

```text
1. PermissionsGuard:
   principal = { sub: "attacker", role: "user" }
   requirement = { permissions: ["users:write"], mode: "all" }
   params = { id: "victim" }
   body = { ownerId: "attacker", email: "takeover@example.test" }
   real AuthorizationService; fake ExecutionContext only
   result: allowed = true

2. Nest:
   Test.createTestingModule({ imports: [TenancyModule.forRoot()] }).compile()
   result: invalid export of PurgeExpiredInvitationsCommand
   metadata inspection also finds InvitationRetentionWorker unregistered

3. DatabaseService:
   real runTransaction / emitAfterCommit / CLS
   transaction adapter records BEGIN, invokes callback, then records COMMIT
   result: ["BEGIN", "mutation", "external-effect", "COMMIT"]

4. requestFingerprint:
   DELETE /notes/one, routeOptions.url = /notes/:id
   DELETE /notes/two, routeOptions.url = /notes/:id
   result: equal digests despite different resource IDs
```

The transaction adapter proves callback order, not PostgreSQL rollback behavior. The guard proof establishes the authorization decision, not a completed account takeover. Real database/HTTP/provider tests remain release-gate work.

The omitted web project can be checked directly from apps/web with:

```sh
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

## Coverage map for the requested audit

| Requested area               | Where addressed                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Boilerplate completeness  | Capability matrix; existing strengths; direct verdict                                               |
| 2. Architecture              | Findings H01/H02/M01–M05/M12; architecture assessment; target design                                |
| 3. Reusability               | M01/M02/M10/L02; minimal-edition release gate                                                       |
| 4. Authentication/security   | C01; H03–H10/H16/H22/H23/H25; security assessment                                                   |
| 5. RBAC/ABAC                 | C01/H03/H07/M10; authorization capability table                                                     |
| 6. Multi-tenancy             | H02/H04/H12/H16/H18/H24; tenancy invariants                                                         |
| 7. Database                  | C03/H01/H02/H04/H15/H20/M05; target database design                                                 |
| 8. Scalability/performance   | H13/H14/H25/M04/M05/L02; growth/failure tables                                                      |
| 9. Reliability               | H01/H05/H06/H11–H15/H22/H24; failure matrix                                                         |
| 10. Jobs/events              | H06/H11/H12/M03/M04; job/event target design                                                        |
| 11. Observability            | M06/M07; telemetry and operations target                                                            |
| 12. Frontend                 | H17–H19/M10/L02; frontend/API assessment                                                            |
| 13. API                      | C01/H08/H15/M03; capability matrix and contract strategy                                            |
| 14. Testing                  | Verification table, H19/M12, testing strategy                                                       |
| 15. DevOps                   | H20–H23/M08/M09; release gates                                                                      |
| 16. Developer experience     | M01/M02/M12/L01/L02; generators and scorecard                                                       |
| 17. Dependencies/upgrades    | H23/L01; dependency sustainability table                                                            |
| 18. Data governance          | C03/H24/M07/M08; governance model                                                                   |
| 19. Hidden future problems   | Growth/horizon tables and failure analysis                                                          |
| 20. Avoiding overengineering | Placement matrix; removal/simplification; optional architecture                                     |
| 21. Scorecard                | All 20 requested scores with rationale                                                              |
| 22. Classification           | Three CRITICAL, 25 HIGH, 12 MEDIUM, two LOW findings; conditional capabilities classified in matrix |
| 23. Final verdict            | Ten direct answers                                                                                  |
| 24. Recommended architecture | Core/optional tree and execution/operations design                                                  |

The recommendation is to stabilize and prove the foundation already present. After those release gates pass, this codebase could substantially reduce repeated architecture work. At the audited revision, adopting it as an unquestioned foundation would copy important defects into every future project.
