# Creating a backend module

This guide uses an `orders` domain. Choose the domain boundary before creating files; do not split
one use case across arbitrary modules.

## 1. Generate the skeleton

```sh
pnpm generate:module orders
```

Names must be lowercase kebab-case. The generator refuses path traversal and existing modules. It
creates compilable placeholders in the mandatory layers:

```text
apps/api/src/modules/orders/
├── orders.module.ts
├── presentation/orders.controller.ts
├── application/commands/create-orders.command.ts
├── application/queries/get-orders.query.ts
├── domain/{entities,value-objects,events,errors}/
└── infrastructure/{schemas,orders.repository.ts}
```

The generator cannot infer business rules, public contracts, persistence fields, or indexes. The
module is not complete until the following steps are implemented. Running
`pnpm generate:feature orders order` later replaces the scaffold with a complete vertical slice.

## 2. Define the public API first

In workspace packages add:

- Zod input/output schemas in `packages/contracts/src/schemas/`.
- Cross-application types in `packages/contracts/src/types/`.
- An oRPC contract in `packages/contracts/src/contracts/`.
- Permissions in `packages/authorization/src/`.
- User-facing translation keys in `packages/i18n/src/locales/`.
- Explicit barrel exports for the new public definitions.

Never duplicate these definitions inside the API module.

Use OpenAPI placeholders (`/{id}`) in contract paths. The Nest adapter translates them to its
`:id` route syntax, and the OpenAPI client substitutes values safely at runtime.

## 3. Implement the domain

Add entities and value objects containing pure business behavior. Define expected failures as typed
error unions such as `{ type: "ORDER_NOT_FOUND" }`. Add past-tense domain events only for meaningful
state changes. Domain code must not import NestJS or database drivers and must return neverthrow `Result`
instead of throwing expected failures.

## 4. Implement persistence

Add the Drizzle schema in `infrastructure/schemas/` and map database rows to domain entities in the
repository. Choose ownership before writing queries:

- Global data extends `BaseRepository`.
- Tenant-owned data extends `TenantScopedRepository` (or `BaseRepository` with `tenantScoped = true`).

Import repository primitives only from `infrastructure/database`. Use lean reads, selected fields,
pagination, and batch operations. Declare table schemas and indexes in Drizzle schemas and migrations.

## 5. Implement CQRS use cases

Create one command per write and one query per read. Application classes orchestrate repositories
and domain logic, return `Result<T, E>`, and never access raw database clients directly. Use the transactional outbox for
critical events that must commit with data.

Keep each class focused; do not replace commands and queries with a flat service.

## 6. Implement the controller

Use `@Controller()` with standard NestJS HTTP decorators (`@Post`, `@Get`, `@Patch`, `@Delete`).
Each route calls exactly one command or query and maps its `Result` through localized presentation error maps.
Protect mutations with permissions and idempotency where required.

Add the oRPC presentation adapter beside the REST controller. Decorate each procedure with
`@Implement(contract.procedure)`, use `implement(contract.procedure).handler(...)`, and delegate
to the same command/query as REST. The adapter is served below `/api/v1/rpc`; keep it free of a
second business implementation. Add a parity test that compares contract metadata and a smoke
test that exercises at least one authenticated and one public procedure.

## 7. Wire the module

List the controller, repository, commands, queries, and listeners in `orders.module.ts`.
Export commands/queries needed by another module, never internal repositories.
The full-stack feature generator merges the feature into the module file and imports
`OrdersModule` into `apps/api/src/app.module.ts` automatically. If you customize the module
manually, verify those registrations after generation.

Cross-module work calls another module's command/query or publishes an event; it never imports the
other module's repository.

## 8. Notify on meaningful events

Never send email, push, or realtime messages from your module. Dispatch a domain
event through the transactional outbox, then add a handler in
`notifications/application/listeners/domain-event-fanout.listener.ts` plus a
type entry in `NOTIFICATION_TYPES` (`@repo/contracts`) and title strings in
`packages/i18n`. Declare the event's `tenantId` (or omit it for global events),
list the channels in `defaultChannels`, and set `digestWindowMinutes: 0` unless
the type should batch. See `docs/NOTIFICATIONS.md` for the full recipe.

## 9. Add tests and validate

- Unit-test domain behavior without NestJS or external services.
- Unit-test commands and queries with mocked repositories.
- Integration-test repositories against real PostgreSQL.
- E2E-test critical routes and authorization.

Run:

```sh
pnpm format
pnpm rules:check
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
```

Before review, ask: “Is this the simplest structure that could work?” Confirm files respect the
`ai_instructions/CODE_QUALITY_RULES.md` limits (one job per file), list endpoints are paginated,
translations have locale parity, and schema changes have reversible migrations.
