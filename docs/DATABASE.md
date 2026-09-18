# Database infrastructure

The API has one database boundary at `apps/api/src/infrastructure/database`. Feature modules use
its public `index.ts` barrel and do not import its internal files.

## Responsibilities

```text
database/
├── context/                  tenant context backed by CLS
├── repositories/             shared repository primitives and query helpers
├── database-pool.ts          bounded pool and query instrumentation
├── database.module.ts        connection and provider ownership
├── database.service.ts       transactions and connection lifecycle
├── database.types.ts
└── index.ts                  supported public API
```

`DatabaseModule` is global and owns the Postgres `pg.Pool` and Drizzle client. `AppModule` imports it
but does not configure Postgres directly. Connection pool and timeout values come from the validated
environment configuration (`DATABASE_URL`, `DB_MAX_POOL_SIZE`).

## Repository usage

Use `BaseRepository` for global tables and `BaseRepository` with `tenantScoped=true` for tenant-owned
tables:

```ts
import { BaseRepository } from "../../../infrastructure/database";
```

Repository reads paginate with a bounded page size, inherit the active Postgres transaction from CLS,
and exclude soft-deleted records unless explicitly requested. `softDeleteById` is the normal
application deletion primitive. `deleteById` is a physical delete and is reserved for bounded
retention/lifecycle workers after the owning module has applied its retention policy.

Tenant-scoped repositories derive `tenantId` from trusted CLS context in multi-tenant mode. They
overwrite caller-provided tenant filters and fail closed when no tenant is active.

Declare indexes with the owning Drizzle schema so generated snapshots remain accurate, then review
and apply them only through append-only SQL migrations (`migrations/pg/*.sql`). For very large
production tables, split blocking index work into a deliberate operational migration using the
provider's concurrent-index procedure.

## Transactions

Use `DatabaseService.withResultTransaction` when application operations already return `Result`:

```ts
const result = await database.withResultTransaction(async () => {
  const created = await repository.create(input);
  if (created.isErr()) return err(created.error);
  return ok(created.value);
});
```

The service creates a Postgres transaction via Drizzle, places it in CLS (`databaseTx`) for all
repository calls, commits successful results, aborts errors, and automatically handles rollback.
Transactions return `{ type: "TRANSACTION_FAILED" }` for infrastructure failures.

Nested calls to `runTransaction` or `withResultTransaction` automatically reuse the outer ambient
transaction stored in CLS context (`databaseTx`), isolating sub-operations via PostgreSQL savepoints
(`withSavepoint`) to prevent nested errors from poisoning the outer transaction. Post-commit side
effects (`emitAfterCommit`, `runAfterCommit`) are held in CLS and drained only after the outermost
transaction promise commits.

HTTP handlers use a transaction by default to establish transaction-local PostgreSQL RLS context.
Handlers that perform password hashing, external I/O, streams, or other slow work must use
`@NoDatabaseTransaction()` and let their commands open short explicit transactions only around SQL
state changes. Login and registration follow this pattern so Argon2 work never occupies a pooled
database connection.

Scheduled background worker tasks execute exclusively across clustered worker instances via
`DatabaseService.withExclusiveExecution(key, fn)`. When Redis is available, it transparently
delegates to `RedisLockService` (using atomic `SET NX PX` with a Lua token release script) to ensure
full compatibility with PgBouncer transaction pooling without tying up database client connections
or interfering with PostgreSQL autovacuum. If Redis is unconfigured or unavailable, it cleanly
falls back to a dedicated connection session-level advisory lock (`pg_try_advisory_lock`).

## Connection pooling (PgBouncer)

Staging exercises PgBouncer in transaction mode. Production offers it through the optional
`pooling` profile; managed database proxies are also valid. The app needs no code changes:

- **Why it is safe here:** RLS tenant context is set per transaction (`set_config(..., true)`
  inside `runWithTransactionContext`), so nothing leaks across pooled sessions. No app code
  uses `LISTEN`/`NOTIFY`, session-level `SET`, or explicit `.prepare()` calls.
- **Drizzle prepared statements** work in transaction mode because the pooler runs
  `max_prepared_statements = 100` (PgBouncer >= 1.21 tracks them per protocol). Never lower
  it without re-verifying; `prepared statement does not exist` errors mean exactly this.
  `server_reset_query` stays at the transaction-mode default (`DISCARD ALL`), so no
  session state survives across pooled checkouts.
- **Bypass list (direct connections only):** migrations (advisory locks) and `drizzle-kit`
  commands use `DB_DIRECT_URL`, falling back to `DATABASE_URL`. Seed scripts are plain
  CRUD with no locks or `LISTEN`, so they are pooler-safe; `staging-seed` still pins the
  direct URL by construction.
- **Sizing:** `(replicas x DB_MAX_POOL_SIZE 5-10) -> pgbouncer pool 25-50 -> Postgres
max_connections`. Start small; grow on pool-wait metrics, not guesses.
- **Health story:** the API and worker readiness probes run through the configured connection, so a
  dead pooler makes them unhealthy. The deployment load balancer/orchestrator must deregister
  unhealthy replicas; the single-host static NGINX reference does not perform active discovery.
- Session mode is a documented fallback only, not built: transaction mode is correct here
  because all RLS context is transaction-local; revisit only if a future workload needs
  session-pinned features.
- Enable in prod with `--profile pooling` and point app/worker `DATABASE_URL` at the pooler;
  staging always pools so the path is exercised before production.

## Adding database capabilities

1. Put reusable technical code in the appropriate database subdirectory.
2. Keep internal helpers private; export only stable developer-facing capabilities from `index.ts`.
3. Import the public database barrel from feature modules.
4. Add unit tests for pure helpers and integration tests for real repository behavior.
5. Add or change indexes only through a migration.
6. Freeze and verify migration checksums with `pnpm db:migrate:freeze` and
   `pnpm db:migrate:lineage`; run API tests, lint, typecheck, and build.
