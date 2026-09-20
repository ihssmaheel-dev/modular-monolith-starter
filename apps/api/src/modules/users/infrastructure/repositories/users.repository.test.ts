import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersRepository } from "./users.repository";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { RedisService } from "../../../../infrastructure/redis";

describe("UsersRepository Cache Invalidation", () => {
  let repository: UsersRepository;
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
      get: vi.fn(() => ({ mode: "single" })),
    } as unknown as TenantContextService;

    repository = new UsersRepository(mockDb, mockContext, mockRedis);
  });

  it("invalidates user cache keys on invalidateCache", async () => {
    await repository.invalidateCache("user-123");

    expect(mockRedisClient.del).toHaveBeenCalledWith("cache:user:user-123");
    expect(mockRedisClient.del).toHaveBeenCalledWith("user:user-123");
  });

  it("fails open cleanly when Redis client throws during invalidation", async () => {
    mockRedisClient.del.mockRejectedValue(new Error("Redis disconnected"));

    await expect(repository.invalidateCache("user-123")).resolves.toBeUndefined();
  });

  it("does not throw when Redis service is not provided", async () => {
    const repoWithoutRedis = new UsersRepository(mockDb, mockContext);

    await expect(repoWithoutRedis.invalidateCache("user-123")).resolves.toBeUndefined();
  });
});
