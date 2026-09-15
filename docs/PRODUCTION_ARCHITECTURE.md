# Production Architecture Baseline

This repository is a modular monolith with one deployable API and one web client. `TENANCY_MODE` is selected at deployment time as `single` or `multi`; client requests cannot change it.

## API and contracts

`@repo/contracts` is the schema source of truth and the oRPC contract registry. The Nest
`@orpc/nest` adapter serves the contracts as the runtime transport at `/api/v1/rpc/*`; the typed
`@repo/api-client` uses this transport by default. Compatibility REST controllers remain at
`/api/v1/*` and call the same application commands/queries. A route is complete only when its
contract, oRPC handler, REST compatibility mapping (where required), and transport parity smoke
test are present.

### oRPC request flow

```text
oRPC client → OpenAPI link → Nest @orpc/nest adapter → guards/interceptors
  → contract validation → application command/query → repository → database/outbox/audit
```

`v1` is the stable public API surface. Contracts and module controllers are version-neutral; a
breaking API change creates a new transport version without modifying the previous version's
contract. API documentation remains at `/api/docs`, the application serves health checks at `/api/v1/health/*` (NGINX aliases `/health/*`), and
metrics use `/metrics`.

Authentication, tenant, locale, CSRF, and idempotency headers are injected by the shared client;
the same global Nest security pipeline protects both transports. oRPC errors use the stable API
error code and localized message envelope, while the REST surface remains a compatibility option
without a second business implementation.

### Response and error contracts

Every REST controller method is decorated with the exact output schema used by its oRPC
procedure. A global response interceptor parses the returned value at the HTTP boundary; contract
violations become a safe 500 response and are logged with the request ID. oRPC's implementation
interceptor performs the equivalent output validation for RPC calls. The parity suite fails when a
route is missing a shared schema or its REST/oRPC method, path, or status diverges.

All failures use `ApiErrorEnvelopeSchema`:

```json
{
  "code": "VALIDATION_FAILED",
  "i18nKey": "api.error.validationFailed",
  "message": "Validation failed",
  "status": 400,
  "requestId": "request-id",
  "fieldErrors": { "email": ["Invalid email"] },
  "retry": { "retryable": false }
}
```

The REST response is the envelope itself; the oRPC response keeps it in `data` and mirrors the
stable fields at the transport level. Messages are translated by `I18nService`, field errors are
safe for form rendering, and retry metadata is emitted for rate limits and transient upstream
failures. No framework exception text or stack trace is returned to clients.

### Idempotent mutations

Endpoints marked `@Idempotent()` require a bounded `Idempotency-Key`. The Redis record is scoped
to the trusted tenant and actor and stores a SHA-256 request fingerprint made from the HTTP method,
route template, and canonical request-body hash. A key reused for another request is rejected;
completed responses are replayed only when every fingerprint component matches. Processing records
are short leases, recovered atomically after the stale threshold, and released conditionally by
their owner when a handler fails. Responses larger than `IDEMPOTENCY_MAX_RESPONSE_BYTES` are not
cached, and completed/processing TTLs are validated at startup. Concurrency tests cover one-owner
claims, conflicts, replay, stale recovery, and lock release.

## Request security pipeline

Guards run in registration order: the cheap IP limit, authentication, CSRF, tenant resolution,
explicit actor/tenant aggregate limits, then permissions. Interceptors establish the request ID,
validate mutation origins, record metrics/traces/logs, deduplicate eligible HTTP requests, establish
the database transaction when required, and validate responses. Password hashing, external I/O, and
long-lived transports opt out and use short command-owned database units of work. Zod validates
transport input before the thin controller delegates to an application command or query.

## Modules

Each module owns its domain entities, application commands/queries, policies, events, persistence schema, repository, presentation adapter, error map, and tests. Cross-module database imports are prohibited.

## Tenancy

Single mode carries no tenant identity (`{ mode: "single" }` — there is no default tenant). Multi mode requires an authenticated membership for the requested tenant. Tenant-scoped repositories and PostgreSQL RLS provide defense in depth. System jobs must use an explicit system context and must be tested for cross-tenant isolation. Outbox writes make this distinction explicit: `dispatchTenant` derives a trusted tenant scope, while `dispatchGlobal` uses the internal transaction-local system scope. The system flag is not accepted in public tenant context or request data.

## Events and side effects

Critical events are written to the transactional outbox in the same database transaction as the
state change. Event payloads are versioned and carry stable domain/tenant identifiers; request IDs are
logged for correlation. Delivery is at least once. Consumers must make their own effects idempotent;
the core provides durable SQL operation receipts for effects that need a transactionally recorded
claim/result. Dead-lettered outbox events are replayable.

## Authentication

Access tokens are short-lived and validate issuer, audience, algorithm, and account version. Login
performs one Argon2 verification for both present and missing identities and returns the same invalid
credential response for missing, wrong-password, and unverified accounts. The protected web layout
bootstraps against `GET /api/v1/auth/me` before rendering application content, so persisted UI state
is never treated as proof of a live session. Refresh tokens carry a unique `jti` and are single-use
when Redis is available; reuse is rejected and logout/password reset increment the account version,
revoke sessions, and disconnect realtime clients. Redis revocation fan-out ensures every API replica
closes its local realtime connections. Signing-key rotation uses `JWT_SIGNING_KEYS` and
`JWT_REFRESH_SIGNING_KEYS`: new tokens carry the active `kid`, verification accepts every retained
key, and legacy tokens without `kid` use the legacy secret fallback. Keep old keys until the maximum
token lifetime has elapsed before removing them.

## Transaction boundaries

HTTP requests use a short transaction by default so PostgreSQL RLS context is always configured; long-lived or external-I/O handlers opt out with `@NoDatabaseTransaction` and create short explicit database scopes around their reads/writes. Commands own explicit `withResultTransaction` units of work. SMTP, S3 presigning/deletion, Redis, and other network calls are performed outside mutation transactions. PostgreSQL statement, lock, and idle-in-transaction timeouts are configured from validated environment variables.

## File lifecycle

Uploads are recorded as `pending`, confirmed as `uploading` quarantine records only after an S3
metadata check, and promoted to `uploaded` by the scheduled scanner. The presigned PUT binds content
length/type and quarantine tagging. Promotion binds the scanned object version, ETag, and checksum.
Failed or stale records are marked/removed by bounded cleanup and cursor-based reconciliation.
Deletion marks the database row first, then removes the object; deleted rows remain retryable when S3
fails. Per-user and per-tenant quota locks serialize reservations.

## Durable events and realtime

The outbox relay claims rows briefly, validates a versioned envelope, and publishes to the BullMQ `domain-events` queue before marking the row `PUBLISHED`. Queue consumers validate envelopes, use the outbox ID as an idempotent job ID, and retain failed jobs for inspection. Dead-letter rows can be replayed through `OutboxService.replayDeadLetter`. Realtime fans out through one consumer group per API replica (`realtime-dispatchers-<instance>`), so every replica receives every event and delivers to its local connections — a single shared group would load-balance events across replicas and silently drop user-targeted messages. Groups heartbeat every loop pass; `RealtimeStreamReaper` destroys groups whose heartbeat expired, and consumers recreate their group on `NOGROUP`. `XAUTOCLAIM`, per-group delivery budgets, and a stream dead-letter key are retained; failed or malformed messages are never acknowledged until retry exhaustion.

## Worker separation

Queue and scheduled workers run in a dedicated worker deployment using the same AppModule while the
API process remains stateless. The worker exposes authenticated Prometheus metrics and dependency
readiness on its own port. Production orchestration scales API and worker replicas independently and
monitors queue depth, outbox age, retry/dead-letter state, notification delivery, privacy export,
realtime lag, and worker heartbeat. Every bundled alert maps to a runbook.

## Verification gate

Production changes require passing architecture rules, API/web typechecks, all package builds, unit/integration/contract/E2E tests, migration checks, security scans, dependency audit, and container/SBOM checks. The CI workflow is the enforcement point; local development should run the same commands before review.

## Operations runbook

Step-by-step delivery, TLS, secrets, workers, alerting, backups, and load shedding live in
[`PRODUCTION_OPS.md`](./PRODUCTION_OPS.md). Read it before your first production deploy.
