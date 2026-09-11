// Seeds the STAGING database (host localhost:5433). Never touches dev (5432):
// DATABASE_URL is pinned below and explicit process env always wins over .env files.
const { spawnSync } = require("node:child_process");

process.env.DATABASE_URL =
  process.env.STAGING_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/app";
process.env.SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@staging.test";
process.env.SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "staging-admin-12345";

process.stdout.write(`Seeding staging database (${process.env.DATABASE_URL})\n`);
const result = spawnSync("pnpm", ["--filter", "api", "db:seed"], { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
