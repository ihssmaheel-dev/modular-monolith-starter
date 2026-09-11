# 0017. Journaled migrations applied before boot

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `drizzle-kit` journaling, the locked migration runner, and migrate/status/check commands.

## Context

Schema drift between code and database is a top production-killer: app boots against columns that don't exist (or vice versa), usually discovered at 2 AM.

## Decision

`drizzle-kit` generates reviewable SQL into a journaled `migrations/pg/` directory; migrations are locked and applied before the API starts serving. `db:migrate:status` and `db:migrate:check` verify fresh-install and upgrade paths in CI. Destructive changes follow expand/contract, never surprise drops.

## Consequences

Gain: schema and code move as one unit; fresh environments build from zero deterministically; upgrade paths are tested, not hoped. Pay: every schema change costs a generated migration plus review, and long-running migrations need out-of-band planning (no magic online DDL here).

## Alternatives considered

- Auto-sync (`synchronize: true` style): rejected, drops data-adjacent structures casually and is unreviewable by design.
- Hand-written SQL without a journal: rejected, ordering and fresh-install reproducibility rot within months.
