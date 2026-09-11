# 0045. A scripted single → multi tenancy migration path

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `scripts/migrate-to-multi-tenant.ts` (dry-run capable).

## Context

Customers outgrow single-tenant mode. Without a path, that moment means a replatform project — exactly when the customer is most valuable and least patient.

## Decision

`scripts/migrate-to-multi-tenant.ts` backfills organization, memberships, and tenant IDs across users, notes, files, audit, and outbox rows, with organization name/slug options and a dry-run mode. Run it rehearsed, before anyone needs it at 2 AM.

## Consequences

Gain: the tenancy decision stays reversible; sales can promise the upgrade path honestly. Pay: the script must be re-verified whenever tenant-owned tables change — a new table without backfill coverage silently breaks the promise.

## Alternatives considered

- Manual SQL per migration: rejected, error-prone under pressure and unrepeatable.
- Dual-write from day one: rejected, permanent complexity tax for a one-time event.
