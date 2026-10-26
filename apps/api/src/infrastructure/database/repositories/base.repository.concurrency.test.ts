import { describe, expect, it, vi } from "vitest";
import { PgDialect, integer, pgTable, text, timestamp, type PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import type { DatabaseService } from "../database.service";
import type { TenantContextService } from "../tenancy/tenant-context.service";

const fields = () => ({
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),
  name: text("name"),
  updatedAt: timestamp("updated_at"),
  deletedAt: timestamp("deleted_at"),
});
const versioned = pgTable("versioned", { ...fields(), version: integer("version") });
const authVersioned = pgTable("auth_versioned", {
  ...fields(),
  authVersion: integer("auth_version"),
});

class Repository extends BaseRepository<Record<string, unknown>, Record<string, unknown>> {
  constructor(table: PgTable, database: DatabaseService, context: TenantContextService) {
    super(table, database, context, true);
  }
  protected toDomain(row: Record<string, unknown>) {
    return row;
  }
}

function setup(table = versioned as PgTable) {
  const returning = vi.fn().mockResolvedValue([]);
  const where = vi.fn((_predicate: SQL) => ({ returning }));
  const set = vi.fn((_payload: Record<string, unknown>) => ({ where }));
  const database = {
    getTx: vi.fn(),
    getDb: () => ({ update: () => ({ set }) }),
  } as unknown as DatabaseService;
  const context = {
    get: () => ({ mode: "multi", tenantId: "tenant-a" }),
    isSystemScope: () => false,
  } as unknown as TenantContextService;
  return { repository: new Repository(table, database, context), returning, where, set };
}

describe("BaseRepository optimistic writes", () => {
  it("reports a stale initial version as CONFLICT instead of a successful null", async () => {
    const { repository, set } = setup();
    const result = await repository.updateByIdWithVersion("entity", 0, { name: "Changed" });
    expect(result).toMatchObject({ error: { type: "CONFLICT" } });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });

  it("increments the actual authVersion column when no version column exists", async () => {
    const { repository, returning, set } = setup(authVersioned);
    returning.mockResolvedValue([{ id: "entity", authVersion: 1 }]);
    const result = await repository.updateByIdWithVersion("entity", 0, { name: "Changed" });
    expect(result.isOk()).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ authVersion: 1 }));
    expect(set.mock.calls[0]?.[0]).not.toHaveProperty("version");
  });

  it("keeps tenant, version and soft-delete guards in the atomic update predicate", async () => {
    const { repository, where } = setup();
    await repository.updateByIdWithVersion("entity", 0, { name: "Changed" });
    const predicate = where.mock.calls[0]?.[0] as SQL;
    const compiled = new PgDialect().sqlToQuery(predicate);
    expect(compiled.sql).toContain('"tenant_id" =');
    expect(compiled.sql).toContain('"version" =');
    expect(compiled.sql).toContain('"deleted_at" is null');
    expect(compiled.params).toEqual(["entity", "tenant-a", 0]);
  });

  it("keeps unversioned not-found behavior without writing soft-deleted rows", async () => {
    const { repository, where } = setup();
    const result = await repository.updateById("missing", { name: "Changed" });
    expect(result.isOk() && result.value).toBeNull();
    const compiled = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0] as SQL);
    expect(compiled.sql).toContain('"deleted_at" is null');
  });
});
