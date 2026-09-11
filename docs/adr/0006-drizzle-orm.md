# 0006. Drizzle ORM, SQL-first

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the schema files, `drizzle-kit` journaled migrations, and RLS usage.

## Context

The data layer must stay close to Postgres (RLS policies, composite indexes, hand-tunable SQL) while still mapping rows to domain entities without handwritten mappers everywhere.

## Decision

Drizzle: TypeScript schema definitions, `drizzle-kit` generated SQL migrations applied before boot, relational queries where they read cleanly, raw SQL escape hatches where they don't. No runtime magic, no separate schema language, no query engine binary.

## Consequences

Gain: migrations are reviewable SQL; RLS and Postgres specifics stay first-class; tiny runtime footprint. Pay: more explicit code than full-featured ORMs (relations, nested writes), and the team owns SQL competence instead of outsourcing it.

## Alternatives considered

- Prisma: rejected, heavyweight engine + migration system for needs Drizzle covers, plus Rust binaries in every environment including minimal containers.
- TypeORM: rejected, decorator magic and a maintenance history that no longer inspires confidence.
- Raw `pg` everywhere: rejected, mapping boilerplate in every repository with no type-safe query builder in return.
