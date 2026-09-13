import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseRepository } from "./base.repository";
import { pgTable, text } from "drizzle-orm/pg-core";
import type { DatabaseService } from "../database.service";
import type { TenantContextService } from "../context/tenant-context.service";

const testTable = pgTable("test_entities", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),
  name: text("name"),
});

interface Entity {
  id: string;
  tenantId?: string;
  name: string;
}

class TestRepo extends BaseRepository<Entity, typeof testTable.$inferSelect> {
  constructor(db: DatabaseService, ctx: TenantContextService, tenantScoped: boolean) {
    super(testTable, db, ctx, tenantScoped);
  }

  protected toDomain(row: typeof testTable.$inferSelect): Entity {
    return {
      id: row.id,
      tenantId: row.tenantId ?? undefined,
      name: row.name ?? "",
    };
  }
}

describe("BaseRepository Tenant Isolation", () => {
  let mockDb: DatabaseService;
  let mockContext: TenantContextService;

  beforeEach(() => {
    mockDb = {
      getDb: vi.fn(() => ({
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "1", tenantId: "t-1", name: "Test" }]),
          })),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      getTx: vi.fn().mockReturnValue(null),
    } as unknown as DatabaseService;

    mockContext = {
      get: vi.fn(() => ({ mode: "multi", tenantId: undefined })),
      isSystemScope: vi.fn(() => false),
    } as unknown as TenantContextService;
  });

  it("returns TENANT_REQUIRED when creating entity without active tenant in multi-tenant mode", async () => {
    // When tenantScoped is true, missing tenant context returns error result
    const repo = new TestRepo(mockDb, mockContext, true);
    // Simulate multi-tenant mode
    vi.spyOn(
      repo as unknown as { isTenantIsolationRequired: () => boolean },
      "isTenantIsolationRequired",
    ).mockReturnValue(true);

    const result = await repo.create({ name: "Fail" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "TENANT_REQUIRED" });
    }

    const manyResult = await repo.createMany([{ name: "Fail" }]);
    expect(manyResult.isErr()).toBe(true);
    if (manyResult.isErr()) {
      expect(manyResult.error).toEqual({ type: "TENANT_REQUIRED" });
    }
  });

  it("succeeds when tenant context is present", async () => {
    vi.mocked(mockContext.get).mockReturnValue({ mode: "multi", tenantId: "tenant-123" });
    const repo = new TestRepo(mockDb, mockContext, true);

    const result = await repo.create({ name: "Success" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe("1");
    }
  });

  it("allows trusted system scope without a tenant id", async () => {
    vi.mocked(mockContext.isSystemScope).mockReturnValue(true);
    const repo = new TestRepo(mockDb, mockContext, true);

    const result = await repo.create({ name: "System repair", tenantId: "tenant-123" });

    expect(result.isOk()).toBe(true);
  });

  it("reports whether deleteById removed a row", async () => {
    vi.mocked(mockContext.get).mockReturnValue({ mode: "multi", tenantId: "tenant-123" });
    const returning = vi.fn().mockResolvedValue([{ id: "1" }]);
    vi.mocked(mockDb.getDb).mockReturnValue({
      delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
    } as never);
    const repo = new TestRepo(mockDb, mockContext, true);

    const deleted = await repo.deleteById("1");
    expect(deleted.isOk() && deleted.value).toBe(true);

    returning.mockResolvedValue([]);
    const missing = await repo.deleteById("gone");
    expect(missing.isOk() && missing.value).toBe(false);
  });

  it("applies default limit and custom limit on find()", async () => {
    vi.mocked(mockContext.get).mockReturnValue({ mode: "multi", tenantId: "tenant-123" });
    const limitFn = vi.fn().mockResolvedValue([{ id: "1", tenantId: "tenant-123", name: "Item" }]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    vi.mocked(mockDb.getDb).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: whereFn,
          limit: limitFn,
        })),
      })),
    } as never);

    const repo = new TestRepo(mockDb, mockContext, true);

    const defaultResult = await repo.find({ name: "Item" });
    expect(defaultResult.isOk()).toBe(true);
    expect(limitFn).toHaveBeenCalledWith(1000);

    await repo.find({ name: "Item" }, { limit: 50 });
    expect(limitFn).toHaveBeenCalledWith(50);

    await repo.find({ name: "Item" }, { limit: 99999 });
    expect(limitFn).toHaveBeenCalledWith(5000);
  });
});
