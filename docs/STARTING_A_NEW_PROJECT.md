# Starting a New Project or Module

This repository is a reusable modular-monolith foundation. The `notes` module is a deliberately small reference vertical slice; it is not the product domain. Start every new product or business capability by copying the flow, not by copying storage tables or weakening the boundaries.

## Initialize a fork

After forking, initialize the product metadata and local application identity:

```bash
pnpm project:init --name "Acme Portal" --slug acme-portal --dry-run
pnpm project:init --name "Acme Portal" --slug acme-portal --reset-local-env --yes
```

The command updates package/mobile identifiers, local display names, Docker service names, and
observability labels. `--reset-local-env` recreates ignored local `.env` files with fresh secrets;
it never resets a database or deletes tracked source without an explicit migration plan. The notes
slice remains intentionally available as a reference implementation so its immutable baseline
migration and contract tests stay coherent. Remove that slice only after replacing its migration
with a new product baseline and updating the associated contract, client, UI, and test surfaces.

## Choose the deployment tenancy model first

Set `TENANCY_MODE=single` for a product with one logical workspace, or `TENANCY_MODE=multi` for organizations with memberships. This is deployment configuration, not a request parameter. The same code supports both modes: single mode stores tenant-owned rows with a null tenant and multi mode requires a UUID `x-tenant-id` whose membership is verified for every request. Never accept a client-provided mode.

## New module checklist

1. Define the domain language, invariants, aggregate boundaries, ownership rules, and lifecycle states.
2. Create `apps/api/src/modules/<module>/` with `domain`, `application`, `infrastructure`, and `presentation` layers.
3. Put every input, output, pagination, and error contract in `packages/contracts`; export it from the package barrel.
4. Add the Drizzle schema and repository inside the module. Tenant-owned tables must use `TenantScopedRepository`; never import another module's table.
5. Add commands and queries that return `neverthrow` `Result` values. Keep controllers thin and map errors through `I18nService`.
6. Add authorization actions and policies before adding endpoints. Protect routes with `@RequirePermission` and enforce resource ownership/ABAC in the application layer.
7. Put state changes and critical domain events in one database transaction. Use `dispatchTenant` for tenant-owned events and `dispatchGlobal` for global events; never accept scope from request data. Persist a stable, versioned payload and add actor, correlation, causation, and idempotency metadata when the event contract or integration requires it.
8. Add the migration through Drizzle, update the migration journal, and test both single- and multi-tenant behavior.
9. Add unit, integration, contract, and end-to-end tests before wiring the web feature.
10. Add the web route, tenant-aware query keys, localized labels/errors, loading/empty/error states, and an accessible UI using `@repo/ui`.
11. Add the module to the API module composition root and register its policies/listeners explicitly.
12. Run `pnpm rules:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the full test suite before review.

## Product bootstrap checklist

- Copy `.env.example` to an environment-specific secret store; generate unique JWT, database, Redis, and object-storage credentials.
- Provision PostgreSQL, Redis, object storage, email, telemetry, backups, and alerting before production traffic.
- Run migrations as a release step with the PostgreSQL advisory lock; never use schema push in production.
- Build immutable API and web images as non-root users and deploy behind TLS termination, a trusted proxy, and a WAF/rate limiter.
- Configure readiness checks for every required dependency and liveness checks that do not depend on them.
- Enable structured logs, request IDs, traces, metrics, audit retention, dead-letter alarms, backup verification, and restore drills.
- Define data retention, deletion/export, incident response, key rotation, dependency patching, and rollback procedures.

## What the sample notes flow demonstrates

The notes feature shows the intended path: Zod contract → API client → authenticated/tenant-aware controller → command/query → tenant-scoped repository → domain event/outbox/audit → localized TanStack Start screen. Replace the domain vocabulary and policies for a real feature; do not expose the sample's assumptions as shared infrastructure.

## API transport and versioning decision

oRPC is the canonical application transport. Contracts in `@repo/contracts` define the input,
output, method, path, and success status once; the Nest `@orpc/nest` adapter exposes those
procedures under `/api/v1/rpc/*`, and `@repo/api-client` calls them by default. The oRPC adapter and
the compatibility REST controllers delegate to the same application commands and queries, so
business rules are never duplicated. REST remains available at `/api/v1/*` for health checks,
integrations, uploads, and gradual migrations. Every new route must add the contract, oRPC
presentation handler, REST compatibility mapping when needed, and a parity/smoke test.

`v1` is the stable public API surface. Keep contracts and module code version-neutral; add a new
version at the transport boundary when a breaking change is required. The Scalar documentation
stays at `/api/docs`, while application health is mounted at `/health/*` (with `/api/v1/health/*` alias) and metrics stay at
`/metrics`.
