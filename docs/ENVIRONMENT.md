# Environment-variable reference

`pnpm bootstrap` copies the committed examples to ignored local `.env` files when they do not
exist. API variables are validated by `packages/contracts/src/schemas/env.schema.ts`; web and mobile
variables use the shared web/mobile schemas. Invalid production configuration stops startup. Never
commit an `.env` file or a real credential.

## Web (TanStack Start)

| Variable                        | Default / purpose                                             |
| ------------------------------- | ------------------------------------------------------------- |
| `VITE_API_URL`                  | Required; versioned browser-facing API base URL               |
| `VITE_APP_NAME`                 | `Workspace`; display name                                     |
| `VITE_EXAMPLE_FEATURES_ENABLED` | `false`; compile the Notes reference UI into the web artifact |

Vite values are public build-time configuration. The production web image must be built with its
final values; changing only the container environment does not rewrite an existing client bundle.

## Mobile (Expo)

| Variable                               | Default / purpose                                                |
| -------------------------------------- | ---------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                  | Required; API URL embedded into the native artifact              |
| `EXPO_PUBLIC_APP_NAME`                 | `Workspace`; display name                                        |
| `EXPO_PUBLIC_EXAMPLE_FEATURES_ENABLED` | `false`; compile the Notes reference UI into the mobile artifact |

Expo public values are also embedded at build time and must never contain secrets.

## File-based secrets (`*_FILE`)

For Docker secrets, a Vault agent, or a cloud secret file mount, a sensitive value may be supplied
as `<NAME>_FILE`. Trimmed file content wins over the inline value and passes the same validation.
Supported names are `DATABASE_URL`, `DB_DIRECT_URL`, `REDIS_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `JWT_SIGNING_KEYS`, `JWT_REFRESH_SIGNING_KEYS`, `METRICS_TOKEN`,
`ERROR_REPORTING_TOKEN`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SMTP_USER`, `SMTP_PASS`,
`RESEND_API_KEY`, `EXPO_ACCESS_TOKEN`, and `SEED_ADMIN_PASSWORD`.

```env
JWT_SECRET_FILE=/run/secrets/jwt_secret
DATABASE_URL_FILE=/run/secrets/database_url
```

## API core and connectivity

| Variable                            | Default / purpose                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | `development`; `development`, `test`, or `production`                                               |
| `APP_NAME`                          | `Workspace`; product display name used by API docs and transactional email                          |
| `APP_SLUG`                          | `modular-monolith`; stable product namespace for deployment and telemetry metadata                  |
| `PROCESS_ROLE`                      | `all`; use `api` and `worker` as separate production processes                                      |
| `EXAMPLE_FEATURES_ENABLED`          | `false`; compose the Notes reference module into the API                                            |
| `PORT`                              | `5156`; API listener port                                                                           |
| `TRUST_PROXY`                       | `false`; enable only behind a trusted proxy that replaces forwarding headers                        |
| `LOG_LEVEL`                         | `info`; Pino level from `fatal` through `trace`                                                     |
| `TENANCY_MODE`                      | `single`; choose `single` or `multi` before production data exists                                  |
| `CLIENT_URL`                        | `http://localhost:5155`; comma-separated allowed browser origins                                    |
| `API_URL`                           | `http://localhost:5156`; externally reachable API origin                                            |
| `DATABASE_URL`                      | Local PostgreSQL URL; production requires TLS with `sslmode=require`, `verify-ca`, or `verify-full` |
| `DB_DIRECT_URL`                     | Optional direct URL for migrations and advisory locks; defaults to `DATABASE_URL`                   |
| `TEST_DATABASE_URL`                 | Integration/E2E database; its database name must contain `test`                                     |
| `DB_MAX_POOL_SIZE`                  | `10`; connection pool size per API or worker instance                                               |
| `DB_STATEMENT_TIMEOUT_MS`           | `30000`; statement and client query timeout                                                         |
| `DB_LOCK_TIMEOUT_MS`                | `5000`; transaction lock wait timeout                                                               |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `60000`; idle transaction timeout                                                                   |
| `AUDIT_RETENTION_DAYS`              | `365`; audit retention, constrained to 30-3650 days                                                 |
| `INVITATION_RETENTION_DAYS`         | `90`; settled invitation retention, constrained to 7-3650 days                                      |
| `REDIS_URL`                         | Optional locally and required in production; production requires `rediss://`                        |
| `FEATURE_FLAGS`                     | `{}`; JSON object of boolean runtime flags, with Redis overrides when configured                    |

## Authentication, security, and reliability

| Variable                             | Default / purpose                                                       |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `JWT_SECRET`                         | Legacy/current access-token secret, at least 32 characters              |
| `JWT_REFRESH_SECRET`                 | Separate refresh-token secret, at least 32 characters                   |
| `JWT_SIGNING_KEYS`                   | Optional JSON keyring used for overlapping access-key rotation          |
| `JWT_REFRESH_SIGNING_KEYS`           | Optional JSON keyring used for overlapping refresh-key rotation         |
| `JWT_ACTIVE_KEY_ID`                  | `primary`; active access signing key ID                                 |
| `JWT_REFRESH_ACTIVE_KEY_ID`          | `primary`; active refresh signing key ID                                |
| `JWT_EXPIRES_IN`                     | `15m`; access-token lifetime                                            |
| `JWT_REFRESH_EXPIRES_IN`             | `7d`; refresh-token and maximum session lifetime                        |
| `JWT_ISSUER`                         | `modular-monolith-api`; verified `iss` claim                            |
| `JWT_AUDIENCE`                       | `modular-monolith-client`; verified `aud` claim                         |
| `RATE_LIMIT_MAX`                     | `100`; requests per default rate-limit window                           |
| `RATE_LIMIT_TTL`                     | `60`; default rate-limit window in seconds                              |
| `IDEMPOTENCY_TTL_SECONDS`            | `86400`; completed HTTP response replay lifetime                        |
| `IDEMPOTENCY_PROCESSING_TTL_SECONDS` | `300`; in-flight lease lifetime                                         |
| `IDEMPOTENCY_STALE_AFTER_SECONDS`    | `60`; abandoned lease recovery age; must be shorter than processing TTL |
| `IDEMPOTENCY_MAX_RESPONSE_BYTES`     | `1048576`; largest response retained for replay                         |
| `LOCKOUT_MAX_ATTEMPTS`               | `5`; failed login threshold                                             |
| `LOCKOUT_DURATION_MINUTES`           | `15`; account lockout duration                                          |

Keyring values must be at least 32 characters and the active ID must exist. New tokens include a
`kid`; keep old keys until every token they signed has expired. Every API and worker replica must
receive the same keyrings.

Run `pnpm project:init` when creating a product fork instead of editing `APP_NAME`, `APP_SLUG`,
`JWT_ISSUER`, and `JWT_AUDIENCE` independently. The initializer keeps deployment examples, client
display names, mobile identifiers, Docker names, and observability selectors synchronized.

## Observability and delivery providers

| Variable                        | Default / purpose                                                    |
| ------------------------------- | -------------------------------------------------------------------- |
| `METRICS_TOKEN`                 | Optional locally, at least 32 characters and required in production  |
| `WORKER_METRICS_PORT`           | `9464`; worker metrics and readiness listener                        |
| `OTEL_EXPORTER_OTLP_ENDPOINT`   | `http://localhost:4318/v1/traces`; trace collector                   |
| `OTEL_TRACE_SAMPLE_RATIO`       | `0.2`; production Compose defaults to `0.1`, constrained to `0-1`    |
| `LOKI_HOST`                     | Optional direct Loki endpoint; structured stdout is always available |
| `ERROR_REPORTING_URL`           | Optional provider-neutral HTTPS JSON error sink                      |
| `ERROR_REPORTING_TOKEN`         | Optional bearer token for the error sink                             |
| `PUSH_PROVIDER`                 | `none`; `expo` enables Expo push                                     |
| `EXPO_ACCESS_TOKEN`             | Required when Expo push is enabled                                   |
| `NOTIFICATION_DIGEST_MAX_ITEMS` | `20`; items retained per digest window, constrained to 1-100         |

## Storage

| Variable                  | Default / purpose                                                                 |
| ------------------------- | --------------------------------------------------------------------------------- |
| `STORAGE_DRIVER`          | `s3`                                                                              |
| `S3_ENDPOINT`             | Optional; omit for AWS, set an HTTPS endpoint for another S3-compatible provider  |
| `S3_REGION`               | `us-east-1`                                                                       |
| `S3_BUCKET`               | `uploads`                                                                         |
| `S3_ACCESS_KEY_ID`        | Optional; omit with the secret to use the AWS SDK workload-identity/default chain |
| `S3_SECRET_ACCESS_KEY`    | Optional; must be set together with the access key                                |
| `S3_FORCE_PATH_STYLE`     | `false`; local MinIO examples explicitly set `true`                               |
| `FILE_USER_QUOTA_BYTES`   | `104857600`; reserved and active upload bytes per user                            |
| `FILE_TENANT_QUOTA_BYTES` | `10737418240`; reserved and active upload bytes per tenant                        |
| `FILE_TENANT_MAX_OBJECTS` | `100000`; reserved and active object count per tenant                             |
| `FILE_AV_ENABLED`         | `false`; antivirus scanning for quarantined uploads                               |
| `FILE_AV_URL`             | Required scanner endpoint when scanning is enabled                                |

`apps/api/.env.example` supplies an archived MinIO fixture and static development keys for local S3
adapter tests only. Do not use that container as the production object store. In AWS production,
leave endpoint and keys absent so the SDK obtains short-lived credentials from the task, pod, or
instance identity. The application never makes the bucket public; file metadata links to the
authenticated API download route. A project that needs CDN delivery must add provider-specific
signed delivery URLs while preserving the same authorization boundary.

## Email and seed

| Variable                  | Default / purpose                                  |
| ------------------------- | -------------------------------------------------- |
| `EMAIL_DRIVER`            | `smtp`; `smtp` or `resend`                         |
| `EMAIL_FROM`              | `noreply@example.com`; validated sender            |
| `SMTP_HOST`               | `localhost`; local Mailpit host                    |
| `SMTP_PORT`               | `1025`; local Mailpit port                         |
| `SMTP_USER` / `SMTP_PASS` | Optional SMTP credentials                          |
| `RESEND_API_KEY`          | Required when the Resend driver is selected        |
| `SEED_ADMIN_EMAIL`        | Optional one-time administrator email              |
| `SEED_ADMIN_PASSWORD`     | Optional one-time password, at least 12 characters |

Seed email and password must be configured together.

## Production deployment variables

`docker/.env.prod.example` also defines Compose-only settings. `API_IMAGE_REF` and `WEB_IMAGE_REF`
must be complete immutable registry digest references. `DB_DIRECT_URL` must use the migration role.
`ALLOW_INSECURE_HTTP=true` is allowed only behind a trusted TLS terminator. Optional PgBouncer
variables apply only to the `pooling` profile.

Production Compose deliberately omits plaintext database, cache, and object-storage services. When
adding an API variable, update the shared schema, every applicable example, this reference, and the
deployment configuration in the same change.
