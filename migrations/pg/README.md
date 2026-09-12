# Postgres Migrations

Generated via `drizzle-kit` from `drizzle.config.ts`.

- Schemas: `apps/api/src/infrastructure/*/schemas/*.schema.ts` + `apps/api/src/modules/*/infrastructure/schemas/*.schema.ts`
- Generate: `pnpm --filter api db:generate` -> `migrations/pg/<timestamp>_<name>.sql`
- Apply: `pnpm --filter api db:migrate` (uses the API migrator with a PostgreSQL advisory lock)
- Verify clean and upgrade paths: `pnpm --filter api db:migrate:check` (requires a PostgreSQL
  role with permission to create and drop temporary databases; CI runs this against PostgreSQL 16)
- Dev push: `pnpm --filter api db:migrate:dev` (drizzle-kit push — no history)
- Check status: `pnpm --filter api db:migrate:status` (uses `drizzle-kit check`; run it in CI and before releases)

The migration check creates isolated databases, applies the complete chain to one, and upgrades
another from every migration except the latest. It also verifies the enum ownership, migration
history, hardening RLS policies, and audit-retention function.

> **Pre-production squash (2026-09-12):** All baseline migrations were consolidated into a single `0000_initial.sql` because no production database exists yet. The single file contains the unified schema (all tables, columns, indexes, enums) + forced RLS + audit immutability + retention functions. After this point, migrations in production are append-only — never edit `0000_initial` once you have live production data.

Production migrations are append-only after `0000_initial`. Review generated SQL before applying it, never edit an
already-applied migration, and keep the journal entry in `migrations/pg/meta/_journal.json` in sync.
Operational or security SQL that is not represented in the Drizzle schema belongs in a reviewed,
journaled migration (e.g., `0001_add_feature.sql`).
