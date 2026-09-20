import { describe, it, expect, vi, beforeEach } from "vitest";
import { MembershipsRepository } from "./memberships.repository";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { RedisService } from "../../../../infrastructure/redis";

describe("MembershipsRepository Cache Invalidation", () => {
  let repository: MembershipsRepository;
  let mockRedisClient: { del: ReturnType<typeof vi.fn> };
  let mockRedis: RedisService;
  let mockDb: DatabaseService;
  let mockContext: TenantContextService;

  beforeEach(() => {
    mockRedisClient = {
      del: vi.fn().mockResolvedValue(1),
    };
    mockRedis = {
      getClient: vi.fn(() => mockRedisClient),
    } as unknown as RedisService;
    mockDb = {
      getDb: vi.fn(() => ({})),
    } as unknown as DatabaseService;
    mockContext = {
      get: vi.fn(() => ({ mode: "multi", tenantId: "t-1" })),
    } as unknown as TenantContextService;

    repository = new MembershipsRepository(mockDb, mockContext, mockRedis);
  });

  it("invalidates cache key on invalidateCache", async () => {
    await repository.invalidateCache("tenant-abc", "user-123");

    expect(mockRedisClient.del).toHaveBeenCalledWith("cache:membership:tenant-abc:user-123");
  });

  it("fails open cleanly when Redis client throws during invalidation", async () => {
    mockRedisClient.del.mockRejectedValue(new Error("Redis disconnected"));

    await expect(repository.invalidateCache("tenant-abc", "user-123")).resolves.toBeUndefined();
  });

  it("does not throw when Redis service is not provided", async () => {
    const repoWithoutRedis = new MembershipsRepository(mockDb, mockContext);

    await expect(
      repoWithoutRedis.invalidateCache("tenant-abc", "user-123"),
    ).resolves.toBeUndefined();
  });
});
