# Developer bootstrap

This is the supported local-development path for the monorepo.

## Prerequisites

- Node.js 20.19 or newer (tested on Node 20 + 22)
- pnpm 10.34.5 (`corepack enable` then `corepack prepare pnpm@10.34.5 --activate`)
- Docker Desktop, or Docker Engine with Compose v2.17+
- Git

Verify the tools with `node --version`, `pnpm --version`, and `docker compose version`.

## One-command setup

From the repository root, run:

```sh
pnpm bootstrap
```

The command:

1. Verifies Node, pnpm, Docker, and Compose.
2. Copies each app's `.env.example` to `.env` only when the destination is missing.
3. Installs the locked dependencies with `pnpm install --frozen-lockfile`.
4. Starts Postgres, Redis, MinIO, and Mailpit and waits for ready services.
5. Creates the local MinIO bucket idempotently.
6. Applies pending PostgreSQL migrations via `drizzle-kit`.
7. Builds the complete API, web application, and shared packages.

It never overwrites an existing `.env` and does not create an administrator automatically.

`pnpm bootstrap` is the setup command and `pnpm dev` is the run command —
`pnpm dev bootstrap` is not a thing (turbo has no `bootstrap` task).
Bootstrap expects a fresh database and stops early with instructions when
the local database already contains tables; reset it with
`docker compose -f docker/docker-compose.yml down -v` (deletes local data)
or run `pnpm db:migrate` directly for an existing database.

Start all applications after setup:

```sh
pnpm dev                      # api (5156) + web (5155) via Turborepo
```

Useful filtered runs:

```sh
pnpm dev:api                  # api only
pnpm dev:web                  # creates web env if needed, builds dependencies, then starts web -> http://localhost:5155
pnpm dev:mobile               # creates mobile env if needed, builds dependencies, then starts Expo
pnpm dev:email                # React Email preview workshop -> http://localhost:3002
pnpm --filter web build && pnpm --filter web start # standalone production-like web -> http://localhost:3000
```

Local endpoints:

- API `http://localhost:5156/api/v1` (health probes: `/api/v1/health`), Scalar `http://localhost:5156/api/docs`
- Web `http://localhost:5155`
- MinIO console `http://localhost:9001`, Mailpit `http://localhost:8025`
- Observability: Grafana `http://localhost:3001`, Prometheus `http://localhost:9090`, Loki `http://localhost:3100`, Tempo `http://localhost:3200`, cAdvisor `http://localhost:8081` (override with `CADVISOR_HOST_PORT`)

Stop infrastructure with `pnpm docker:down`.

The pinned MinIO containers are an archived, local compatibility fixture. They
exist to exercise the S3 adapter during development and disposable staging
tests. Do not deploy them as the production object store. Production must use a
managed or independently operated S3-compatible service with supported security
updates, durable backups, lifecycle rules, capacity alarms, and provider-level
request and cost monitoring.

Browser topology: web and API are same-origin in production (nginx serves
the app and proxies `/api/`), and same-host across ports locally
(`localhost:5155` → `localhost:5156`). Cookie authentication (HttpOnly
session cookies plus the readable `XSRF-TOKEN` double-submit pair)
depends on that: split-host deployments cannot share the host-only CSRF
cookie, so they are unsupported for cookie auth. Bearer-token clients
(mobile, scripts) are unaffected by topology. All CORS/Origin/WebSocket
checks derive from `CLIENT_URL` (comma-separated for several origins);
loopback origins are additionally accepted outside production.

## Staging environment

Staging mirrors production shape (nginx + web + api + worker, migrate gate) against
self-hosted dependencies, so it is the last place migrations, images, and config
break before production. Host ports are shifted so staging runs side by side with dev.

```sh
pnpm staging:up    # build images, migrate, start everything -> http://localhost:8080
pnpm staging:seed  # idempotent admin seed into the staging database only (never dev)
pnpm staging:logs  # follow all staging services
pnpm staging:down  # stop everything (add -v via docker compose to wipe staging data)
```

Verify a fresh stack:

```sh
curl http://localhost:8080/api/v1/health/live
curl http://localhost:8080/
```

Mailpit captures staging email at `http://localhost:8026`, MinIO console at
`http://localhost:9003`. Differences from prod, all deliberate: no TLS (plain HTTP
on `:8080`), local Postgres/Redis and an archived S3 compatibility fixture instead of managed services, weak committed
secrets in `docker/.env.staging.example` (copy to gitignored `docker/.env.staging`
for custom values — never production secrets).

### Web local env

Web reads `apps/web/.env` (copied from `.env.example` on `pnpm bootstrap`):

```env
VITE_API_URL=http://localhost:5156/api/v1
```

The web app is independently runnable, but it still needs `VITE_API_URL` to point to a separately running
API. Set it before `build` because Vite embeds it in browser assets; the standalone SSR process also validates
the same variable at startup.

### Mobile local env

Mobile reads `apps/mobile/.env` (copied from `.env.example` on `pnpm bootstrap`):

```env
EXPO_PUBLIC_API_URL=http://localhost:5156/api/v1
```

`EXPO_PUBLIC_*` values are inlined at export time, so set the URL before `expo export`. iOS simulator
can use `localhost`; the Android emulator needs `10.0.2.2`; physical devices need the machine's LAN IP
(e.g. `http://192.168.1.10:3000/api/v1`). Verify native output with
`pnpm --filter mobile build` (`expo export --platform ios --platform android`), not simulators.

## Database migrations

The API reads `DATABASE_URL` from `apps/api/.env`. Migration files live in `migrations/pg/`.

```sh
pnpm --filter api db:migrate:status  # check schema status
pnpm --filter api db:migrate         # apply every pending migration
pnpm --filter api db:generate        # generate new migration from schemas
pnpm db:migrate:freeze               # record checksums for newly reviewed migrations
pnpm db:migrate:lineage              # reject edits to frozen migration history
pnpm --filter api db:migrate:dev     # push schema changes directly in dev
pnpm --filter api db:migrate:check   # verify fresh + upgrade migration paths
```

## Database seeding

The seed is optional and idempotent by administrator email. Add both values to `apps/api/.env`:

```env
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=replace-with-at-least-12-characters
```

Then run `pnpm db:seed`. The command skips when credentials are absent and does not replace an
existing administrator. Remove the credentials from `.env` after use.

## Testing and quality checks

```sh
pnpm build              # required first: tests resolve workspace packages via built dist
pnpm test:unit          # fast unit tests across the workspace
pnpm test:integration   # real infrastructure tests
pnpm test:e2e           # API/application flows (Fastify inject)
pnpm lint               # eslint across api + web + shared packages
pnpm format:check
pnpm rules:check        # dependency-cruiser + conventions (api domain isolation + no fetch in routes + no hardcoded i18n)
pnpm build              # api (dist) + web SSR bundle (dist/server via srvx) + shared packages
pnpm typecheck          # tsc across all workspaces
pnpm --filter web typecheck
```

Integration tests require `TEST_DATABASE_URL` in `apps/api/.env`; its database name must contain
`test`. API E2E tests require `E2E_USE_CONTAINERS=true` and a working Docker-compatible runtime.
Both suites fail fast when their required infrastructure is unavailable. Run one API test with:

```sh
pnpm --filter api exec vitest run src/path/file.test.ts --config vitest.config.mts
```

Use `pnpm test:api:watch` while developing.

## Debugging

Run `pnpm dev:api:debug`, then attach a Node debugger to port `9229`. Breakpoints and source maps
work against the TypeScript API source. Set `LOG_LEVEL=debug` for structured API diagnostics; never add
`console.log` to production code.

Useful runtime checks:

```sh
pnpm run doctor                                    # Diagnose the complete local setup
pnpm run doctor --strict                           # Treat stopped optional services as failures
pnpm run doctor --skip-services                    # Skip Docker and dependency connectivity checks
pnpm --silent run doctor --json                    # Machine-readable diagnostics
pnpm status                                        # Check live TCP connectivity across all 15 services in ~20ms
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs postgres redis minio mailpit
pnpm --filter api db:migrate:status
```

pnpm itself reserves `pnpm doctor` for package-manager configuration. The explicit `run` in
`pnpm run doctor` selects the repository diagnostic. It is read-only, never prints configured
secret values, exits nonzero for required setup failures, and only promotes optional-service
warnings to failures when `--strict` is supplied.

## Troubleshooting

- **`docker` is unavailable:** install/start Docker and confirm `docker compose version` succeeds.
- **A port is occupied:** check `5156` (API), `5155` (Web), `5432` (Postgres), `6379` (Redis), `8025` (Mailpit), `9000` (MinIO), `3001` (Grafana), `8081` (cAdvisor; override with `CADVISOR_HOST_PORT`), `3000` (prod container), then
  stop the conflicting process.
- **Environment validation fails:** compare the relevant `.env` with its `.env.example`; access and
  refresh JWT secrets must differ and contain at least 32 characters.
- **PostgreSQL authentication fails:** verify `DATABASE_URL` matches credentials in `docker-compose.yml`.
- **Integration tests fail before running:** set `TEST_DATABASE_URL` and keep `test` in the database name.
- **API E2E tests fail before running:** set `E2E_USE_CONTAINERS=true` and start Docker.
- **Node or Vite fails with a tiny heap or native `memory allocation failed`:** Windows has exhausted
  its system commit limit. Stop test/build commands before starting dev servers, close unused IDE or
  browser processes, and run `pnpm observability:down` when telemetry is not being inspected. Keep a
  system-managed page file enabled. `pnpm bootstrap` builds serially with a bounded Node heap to avoid
  creating this pressure during setup.
- **Emails do not appear:** keep `EMAIL_DRIVER=smtp`, `SMTP_HOST=localhost`, and `SMTP_PORT=1025`,
  then inspect Mailpit at `http://localhost:8025`.
- **Iterating on an email template:** run `pnpm dev:email` and open `http://localhost:3002` —
  every template renders with sample data and hot-reloads on save. Use the preview for
  design; use Mailpit for verifying real sends. Template `PreviewProps` live next to each
  template in `packages/email/src/emails/`.
- **Local data must be reset:** `docker compose -f docker/docker-compose.yml down -v` permanently
  deletes the local Docker volumes; run it only when that data is disposable.

See [ENVIRONMENT.md](./ENVIRONMENT.md) for configuration and [NEW_MODULE.md](./NEW_MODULE.md) for
feature development.
