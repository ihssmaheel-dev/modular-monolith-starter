# 0011. Pooled tenancy behind a deployment-scoped mode flag

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `TENANCY_MODE` usage, `TENANCY.md`, RLS migrations, and the boot mismatch guard.

## Context

The same codebase must serve single-tenant deployments and multi-tenant SaaS, with no per-client forks and no way for a client to escalate itself into another mode.

## Decision

Pooled model: one database, `tenantId` discriminator, defense in three layers — `TenantContextGuard` + `TenantScopedRepository` at the app layer, `FORCE ROW LEVEL SECURITY` tenant policies at the DB layer, subject-level isolation for notifications/devices/DSR data. `TENANCY_MODE` (`single`|`multi`) is deployment-scoped; multi-only controllers don't even register in single mode; booting `single` against data containing organizations is a hard startup error.

## Consequences

Gain: one codebase serves both motions; isolation is enforced, not hoped for; mode mismatch fails fast instead of leaking silently. Pay: pooled only — database-per-tenant customers cannot be served (see ADR 0045 for the closest escape hatch); every tenant-owned query pays the scoping predicate.

## Alternatives considered

- Database-per-tenant: rejected, migration fan-out and connection sprawl per customer.
- Schema-per-tenant: rejected, same migration problem with weaker tooling.
- Client-selectable tenancy (tenant from request alone): rejected, privilege boundary must live in deployment config, never in client input.
