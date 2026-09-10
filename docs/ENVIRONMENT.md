# Environment-variable reference

Local setup copies the committed examples to ignored `.env` files (`pnpm bootstrap` creates `apps/api/.env` and `apps/web/.env` if missing). Runtime API variables are validated by `packages/contracts/src/schemas/env.schema.ts`; web (`VITE_API_URL`) is validated locally via Zod in `apps/web/src/lib/env.ts`. Invalid production configuration stops startup. Never commit `.env` files or real credentials.

## Web (TanStack Start)

| Variable        | Default / purpose                                                |
| --------------- | ---------------------------------------------------------------- |
| `VITE_API_URL`  | `http://localhost:5156/api/v1`; browser → versioned API base URL |
| `VITE_APP_NAME` | `Workspace`; display name (optional)                             |

Validated in `apps/web/src/lib/env.ts` (`z.string().url()`). Example in `apps/web/.env.example`.

## File-based secrets (`*_FILE`)

For Docker secrets, Vault Agent, or AWS Secrets Manager file mounts, any sensitive variable below
may be supplied via a `<NAME>_FILE` path instead of inline. The file content (trimmed) wins over the
inline value. Supported: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`JWT_SIGNING_KEYS`, `JWT_REFRESH_SIGNING_KEYS`, `METRICS_TOKEN`, `ERROR_REPORTING_TOKEN`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SMTP_USER`, `SMTP_PASS`, `RESEND_API_KEY`, `EXPO_ACCESS_TOKEN`, `SEED_ADMIN_PASSWORD`.

```env
JWT_SECRET_FILE=/run/secrets/jwt_secret
DATABASE_URL_FILE=/run/secrets/database_url
```

Resolution happens in `apps/api/src/config/env.ts` before Zod validation, so file-supplied values face
the same checks. See `docker/.env.prod.example` for the compose-side pattern.

## API core and connectivity

| Variable                            | Default / purpose                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | `development`; one of `development`, `test`, `production`                                                      |
| `PROCESS_ROLE`                      | `all` locally; use `api` for HTTP-only or `worker` for queue/scheduled workers                                 |
| `PORT`                              | `5156`; API listener port                                                                                      |
| `TRUST_PROXY`                       | `false`; set `true` behind nginx/LB so `req.ip` rate-limiting works                                            |
| `LOG_LEVEL`                         | `info`; Pino level from `fatal` through `trace`                                                                |
| `TENANCY_MODE`                      | `single`; choose `single` or `multi` before production data exists                                             |
| `CLIENT_URL`                        | `http://localhost:5155`; allowed browser origin                                                                |
| `API_URL`                           | `http://localhost:5156`; externally reachable API origin                                                       |
| `DATABASE_URL`                      | Local PostgreSQL connection string; production requires TLS (`sslmode=require`, `verify-ca`, or `verify-full`) |
| `DB_MAX_POOL_SIZE`                  | `10`; maximum PostgreSQL connections in pool                                                                   |
| `DB_STATEMENT_TIMEOUT_MS`           | `30000`; maximum statement duration                                                                            |
| `DB_LOCK_TIMEOUT_MS`                | `5000`; maximum lock wait duration                                                                             |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `60000`; idle transaction guard                                                                                |
| `AUDIT_RETENTION_DAYS`              | `365`; minimum 30 days before audit records are purged by the worker                                           |
| `INVITATION_RETENTION_DAYS`         | `90`; minimum 7 days before settled invitations are purged by the worker                                       |
| `REDIS_URL`                         | `redis://localhost:6379` locally; `rediss://` required in production                                           |
| `FEATURE_FLAGS`                     | `{}`; JSON object mapping feature-flag keys to boolean values                                                  |
| `TEST_DATABASE_URL`                 | Integration/E2E database; its name must contain `test`                                                         |

## Authentication, security, and observability

| Variable                             | Default / purpose                                                  |
| ------------------------------------ | ------------------------------------------------------------------ |
| `JWT_SECRET`                         | Access-token secret, minimum 32 characters; replace in production  |
| `JWT_REFRESH_SECRET`                 | Separate refresh-token secret, minimum 32 characters               |
| `JWT_SIGNING_KEYS`                   | Optional JSON keyring for access tokens during rotation            |
| `JWT_REFRESH_SIGNING_KEYS`           | Optional JSON keyring for refresh tokens during rotation           |
| `JWT_ACTIVE_KEY_ID`                  | `primary`; key ID used to sign new access tokens                   |
| `JWT_REFRESH_ACTIVE_KEY_ID`          | `primary`; key ID used to sign new refresh tokens                  |
| `JWT_EXPIRES_IN`                     | `15m`; access-token lifetime                                       |
| `JWT_REFRESH_EXPIRES_IN`             | `7d`; refresh-token lifetime                                       |
| `JWT_ISSUER`                         | `modular-monolith-api`; `iss` claim verified on access tokens      |
| `JWT_AUDIENCE`                       | `modular-monolith-client`; `aud` claim verified on access tokens   |
| `METRICS_TOKEN`                      | Optional locally, minimum 32 characters and required in production |
| `RATE_LIMIT_MAX`                     | `100`; requests allowed per rate-limit window                      |
| `RATE_LIMIT_TTL`                     | `60`; rate-limit window in seconds                                 |
| `IDEMPOTENCY_TTL_SECONDS`            | `86400`; maximum lifetime of a completed idempotent response       |
| `IDEMPOTENCY_PROCESSING_TTL_SECONDS` | `300`; lease lifetime for in-flight idempotent requests            |
| `IDEMPOTENCY_STALE_AFTER_SECONDS`    | `60`; age after which an abandoned lease may be recovered          |
| `IDEMPOTENCY_MAX_RESPONSE_BYTES`     | `1048576`; maximum response size stored for replay                 |
| `LOCKOUT_MAX_ATTEMPTS`               | `5`; failed logins before account lockout                          |
| `LOCKOUT_DURATION_MINUTES`           | `15`; account-lockout duration                                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | `http://localhost:4318/v1/traces`; trace collector endpoint        |
| `LOKI_HOST`                          | `http://localhost:3100`; Loki log aggregation endpoint             |
| `ERROR_REPORTING_URL`                | Optional provider-neutral JSON error sink                          |
| `ERROR_REPORTING_TOKEN`              | Optional bearer token for the error sink                           |
| `PUSH_PROVIDER`                      | `none`; set `expo` to deliver mobile push via Expo Push Service    |
| `EXPO_ACCESS_TOKEN`                  | Optional Expo access token for push delivery                       |
| `NOTIFICATION_DIGEST_MAX_ITEMS`      | `20`; retained items per digest window (1–100)                     |

JWT keyrings are JSON objects whose values are secrets of at least 32 characters. For example:

```env
JWT_SIGNING_KEYS={"2026-01":"old-access-secret-key-32-characters","2026-02":"new-access-secret-key-32-characters"}
JWT_ACTIVE_KEY_ID=2026-02
JWT_REFRESH_SIGNING_KEYS={"2026-01":"old-refresh-secret-key-32-characters","2026-02":"new-refresh-secret-key-32-characters"}
JWT_REFRESH_ACTIVE_KEY_ID=2026-02
```

New tokens include the active key ID as `kid`; verification accepts every key retained in the
keyring. Tokens created before keyrings were enabled have no `kid` and continue to use the legacy
`JWT_SECRET` or `JWT_REFRESH_SECRET` fallback. Keep the legacy secret and old key IDs until all
tokens signed with them have expired, then remove them in a later deployment. Every API and worker
replica must receive the same keyrings during a rotation.

## Storage and CDN

| Variable                | Default / purpose                                             |
| ----------------------- | ------------------------------------------------------------- |
| `STORAGE_DRIVER`        | `s3`                                                          |
| `S3_ENDPOINT`           | `http://localhost:9000` locally; HTTPS endpoint in production |
| `S3_REGION`             | `us-east-1`                                                   |
| `S3_BUCKET`             | `uploads`                                                     |
| `S3_ACCESS_KEY_ID`      | `minioadmin` locally                                          |
| `S3_SECRET_ACCESS_KEY`  | `minioadmin` locally                                          |
| `S3_FORCE_PATH_STYLE`   | `true`; required by local MinIO                               |
| `FILE_USER_QUOTA_BYTES` | `104857600`; active upload quota per user                     |
| `FILE_AV_ENABLED`       | `false`; antivirus scan integration for quarantined uploads   |
| `FILE_AV_URL`           | Optional scanner endpoint returning `{ "clean": boolean }`    |
| `CDN_ENABLED`           | `false`; enable CDN URL generation                            |
| `CDN_DOMAIN`            | Optional public CDN hostname, without protocol                |
| `CDN_BUCKET_PATH`       | `uploads`; public bucket path prefix                          |

## Email and seed

| Variable                  | Default / purpose                                      |
| ------------------------- | ------------------------------------------------------ |
| `EMAIL_DRIVER`            | `smtp`; choose `smtp` or `resend`                      |
| `EMAIL_FROM`              | `noreply@example.com`; validated sender address        |
| `SMTP_HOST`               | `localhost`; local Mailpit host                        |
| `SMTP_PORT`               | `1025`; local Mailpit SMTP port                        |
| `SMTP_USER` / `SMTP_PASS` | Optional SMTP credentials                              |
| `RESEND_API_KEY`          | Required only when `EMAIL_DRIVER=resend`               |
| `SEED_ADMIN_EMAIL`        | Optional one-time administrator email                  |
| `SEED_ADMIN_PASSWORD`     | Optional administrator password, minimum 12 characters |

Seed email and password must be configured together.

## Production Docker Compose

`docker/.env.prod.example` references externally managed TLS-enabled PostgreSQL (`sslmode=require`, `verify-ca`, or `verify-full`),
Redis (`rediss://`), and S3-compatible object storage. The production compose file intentionally does not start plaintext
database/cache/storage services; use `docker/docker-compose.yml` for local development dependencies. Generate unique production
secrets and never reuse the committed local defaults.

When adding an API variable, update the shared Zod schema (`packages/contracts/src/schemas/env.schema.ts`), every applicable example, this reference,
and deployment configuration in the same change.
