import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const requireDatabase = process.env.CI === "true" || process.env.REQUIRE_INTEGRATION_DB === "true";
const RLS_TEST_ROLE = "outbox_rls_test_role";
const TENANT_A = "00000000-0000-0000-0000-000000000001";
const TENANT_B = "00000000-0000-0000-0000-000000000002";
let pool: Pool | undefined;
let databaseAvailable = false;

describe("Outbox global and tenant scope policies", () => {
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
      if (requireDatabase) throw new Error(`Integration database is unavailable: ${String(error)}`);
      return;
    }
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
          CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE};
      GRANT SELECT, INSERT ON TABLE public.outbox_events TO ${RLS_TEST_ROLE};
    `);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("requires trusted system scope for a global event in multi-tenant mode", async () => {
    if (!databaseAvailable || !pool) return;
    const client = await pool.connect();
    try {
      await beginAsTenantRole(client, "multi");
      await client.query("SAVEPOINT global_event_denied");
      await expect(insertEvent(client, undefined, "global.denied")).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT global_event_denied");
      await setScope(client, "multi", undefined, true);
      await expect(insertEvent(client, undefined, "global.allowed")).resolves.toBeDefined();
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("allows a global event in single-tenant mode without system elevation", async () => {
    if (!databaseAvailable || !pool) return;
    const client = await pool.connect();
    try {
      await beginAsTenantRole(client, "single");
      await expect(insertEvent(client, undefined, "global.single")).resolves.toBeDefined();
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("allows only the active tenant for tenant-scoped events", async () => {
    if (!databaseAvailable || !pool) return;
    const client = await pool.connect();
    try {
      await beginAsTenantRole(client, "multi");
      await setScope(client, "multi", TENANT_A, false);
      await expect(insertEvent(client, TENANT_A, "tenant.allowed")).resolves.toBeDefined();
      await client.query("SAVEPOINT tenant_event_denied");
      await expect(insertEvent(client, TENANT_B, "tenant.denied")).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT tenant_event_denied");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

async function beginAsTenantRole(client: PoolClient, mode: "single" | "multi"): Promise<void> {
  await client.query("BEGIN");
  await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
  await setScope(client, mode, undefined, false);
}

async function setScope(
  client: PoolClient,
  mode: "single" | "multi",
  tenantId: string | undefined,
  systemScope: boolean,
): Promise<void> {
  await client.query("SELECT set_config('app.tenancy_mode', $1, true)", [mode]);
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId ?? ""]);
  await client.query("SELECT set_config('app.system_scope', $1, true)", [String(systemScope)]);
}

function insertEvent(client: PoolClient, tenantId: string | undefined, topic: string) {
  return client.query(
    "INSERT INTO public.outbox_events (id, tenant_id, topic, payload) VALUES ($1, $2, $3, $4)",
    [crypto.randomUUID(), tenantId ?? null, topic, JSON.stringify({ test: true })],
  );
}
