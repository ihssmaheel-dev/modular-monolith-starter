import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const requireDatabase = process.env.CI === "true" || process.env.REQUIRE_INTEGRATION_DB === "true";
const RLS_TEST_ROLE = "tenant_isolation_test";
let pool: Pool | undefined;
let databaseAvailable = false;

describe("PostgreSQL tenant isolation", () => {
  beforeAll(async () => {
    if (!databaseUrl) {
      if (requireDatabase) throw new Error("TEST_DATABASE_URL is required for integration tests");
      return;
    }
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query("SELECT 1");
      databaseAvailable = true;
    } catch (error) {
      databaseAvailable = false;
      if (requireDatabase) {
        throw new Error(`Integration database is unavailable: ${String(error)}`);
      }
    }
    if (databaseAvailable && pool) {
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
            CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$;
        GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE};
        GRANT SELECT, INSERT ON TABLE public.notes TO ${RLS_TEST_ROLE};
        GRANT SELECT, INSERT ON TABLE public.organizations TO ${RLS_TEST_ROLE};
        GRANT SELECT, INSERT ON TABLE public.memberships TO ${RLS_TEST_ROLE};
        GRANT SELECT, INSERT ON TABLE public.outbox_events TO ${RLS_TEST_ROLE};
      `);
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("hides rows belonging to another tenant", async () => {
    if (!databaseAvailable || !pool) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      await setScope(client, "multi", undefined, true);
      await client.query(
        "INSERT INTO public.notes (id, tenant_id, title, content, created_by) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
        [
          "rls-tenant-a",
          "00000000-0000-0000-0000-000000000001",
          "Tenant A",
          "Visible",
          "integration-test-user",
          "rls-tenant-b",
          "00000000-0000-0000-0000-000000000002",
          "Tenant B",
          "Hidden",
          "integration-test-user",
        ],
      );
      await setScope(client, "multi", "00000000-0000-0000-0000-000000000001", false);
      const result = await client.query("SELECT tenant_id FROM notes");
      expect(result.rows).toHaveLength(1);
      expect(
        result.rows.every((row) => row.tenant_id === "00000000-0000-0000-0000-000000000001"),
      ).toBe(true);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("requires trusted system scope to bootstrap a multi-tenant membership", async () => {
    if (!databaseAvailable || !pool) return;
    const client = await pool.connect();
    const tenantId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      await setScope(client, "multi", undefined, false);
      await client.query("SAVEPOINT bootstrap_denied");
      await expect(insertMembership(client, tenantId, "bootstrap-user")).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT bootstrap_denied");

      await setScope(client, "multi", undefined, true);
      await client.query(
        "INSERT INTO public.organizations (id, name, slug, created_by) VALUES ($1, $2, $3, $4)",
        [tenantId, "Bootstrap Organization", `bootstrap-${tenantId}`, "bootstrap-user"],
      );
      await expect(insertMembership(client, tenantId, "bootstrap-user")).resolves.toBeDefined();
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

async function setScope(
  client: import("pg").PoolClient,
  mode: "single" | "multi",
  tenantId: string | undefined,
  systemScope: boolean,
): Promise<void> {
  await client.query("SELECT set_config('app.tenancy_mode', $1, true)", [mode]);
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId ?? ""]);
  await client.query("SELECT set_config('app.current_user', $1, true)", ["bootstrap-user"]);
  await client.query("SELECT set_config('app.system_scope', $1, true)", [String(systemScope)]);
}

function insertMembership(
  client: import("pg").PoolClient,
  tenantId: string,
  userId: string,
): Promise<import("pg").QueryResult> {
  return client.query(
    "INSERT INTO public.memberships (id, tenant_id, user_id, user_email, user_name, role) VALUES ($1, $2, $3, $4, $5, $6)",
    [crypto.randomUUID(), tenantId, userId, "bootstrap@example.test", "Bootstrap User", "owner"],
  );
}
