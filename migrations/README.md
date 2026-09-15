# Migration lineage

Committed SQL migrations are append-only. Never edit, rename, reorder, or
delete a migration after it has reached a shared environment. Generate a new
migration for every later schema correction.

After reviewing a newly generated migration, including locks, backfills,
constraints, RLS, and rollback implications, freeze the lineage with:

```bash
pnpm db:migrate:freeze
```

CI runs `pnpm db:migrate:lineage` to compare the journal, SQL file set, and
SHA-256 manifest. A checksum change to an existing migration is a release
blocker unless the migration has never left the author's private branch.
Fresh-install and prior-version upgrade paths are exercised by
`pnpm db:migrate:check` against disposable PostgreSQL databases.
