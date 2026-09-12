# Optional multi-tenancy

Tenancy is a deployment-level choice. Set it before creating production data:

```env
TENANCY_MODE=single
```

or:

```env
TENANCY_MODE=multi
```

Single mode is the default. It registers only `GET /api/v1/tenancy/status`, adds no tenant fields to
new records, and preserves the existing application behavior. Multi mode registers the complete
organization, membership, and invitation API.

## Developer workflow

The shared API client automatically sends the selected organization as `x-tenant-id`. The web
client persists the selection through its tenant store. The first organization can be created
from the built-in switcher or with `POST /api/v1/tenancy/organizations`.

Tenant-owned frontend caches must include the active tenant ID in their query key, or reset when
the tenant changes. Authentication logout/failure already clears the built-in query caches.

To make a domain tenant-owned:

1. Add an optional `tenantId` column to its Drizzle schema (`text("tenant_id")`). It remains null in single mode.
2. Extend `BaseRepository` passing `tenantScoped = true` to `super()`.
3. Add compound tenant indexes in the Drizzle schema and migrations.
4. Never accept `tenantId` in a public input schema.

```ts
import { BaseRepository } from "../../../../infrastructure/database";
import { orders, type OrderRow } from "../schemas/order.schema";

export class OrdersRepository extends BaseRepository<Order, OrderRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(orders, database, tenantContext, true);
  }
}
```

Every inherited create, ID lookup, query, update, pagination, soft delete, and delete is then scoped
from trusted request context. Caller-supplied tenant filters are overwritten.

Global data such as users and organization records continues to use `BaseRepository` with `tenantScoped = false`.
Membership APIs expose users inside an organization; global user administration remains system-admin only.

## Requests and clients

Multi-tenant protected requests require:

```http
X-Tenant-Id: 507f1f77bcf86cd799439011
```

The API verifies active membership before permissions run. Tenant owners, admins, and members have
separate shared permission maps. WebSockets verify and retain the tenant selected at connection time.
SSE (`GET /api/v1/realtime/events`) is `@TenantAgnostic()` and user-scoped instead: `EventSource`
cannot send headers, so no tenant is resolved at connect time and per-user targeting happens at
publish time via `RealtimeService.sendToUser(userId, event, payload, tenantId?)`.

API client setup:

```ts
createApiClient(baseUrl, {
  getTenantId: () => tenantStore.activeTenantId,
});
```

Mutation requests receive automatic idempotency keys. Idempotency cache entries, uploads, audit
records, outbox events, and realtime delivery all include tenant scope.

## Background work

Workers must restore tenant context before calling a tenant-owned repository:

```ts
await tenantContext.run({ mode: "multi", tenantId }, async () => {
  await command.execute(input);
});
```

Include `tenantId` in every tenant-owned job or event payload. Never infer it from a user ID because
one user may belong to multiple organizations.

Outbox events use explicit scope methods. Call `dispatchTenant` for tenant-owned events; it derives
the tenant from the trusted context and rejects missing scope in multi mode. Call `dispatchGlobal`
for global events such as `user.created`; it runs inside the internal system-scope capability and
persists a null `tenant_id`. Request payloads and the public `TenantContext` type cannot enable
system scope. PostgreSQL RLS allows global rows in single mode or in an explicitly elevated system
transaction in multi mode, and integration tests cover both paths.

## Switching an existing project

Do not change a populated deployment from single to multi by changing the environment variable
alone. Create a migration that creates a default organization and owner membership, backfills every
tenant-owned record, prefixes cache/storage keys, and validates compound indexes. Test that
migration against a production-sized copy before enabling multi mode.

Multi-tenant organization creation and invitation acceptance use standard PostgreSQL transactions.
