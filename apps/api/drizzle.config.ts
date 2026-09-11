import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/infrastructure/audit/schemas/*.ts",
    "./src/infrastructure/outbox/schemas/*.ts",
    "./src/modules/*/infrastructure/schemas/*.schema.ts",
  ],
  out: "../../migrations/pg",
  dialect: "postgresql",
  dbCredentials: {
    // Dev tooling talks to Postgres directly, never through a pooler.
    url:
      process.env.DB_DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/app",
  },
  verbose: true,
  strict: true,
});
