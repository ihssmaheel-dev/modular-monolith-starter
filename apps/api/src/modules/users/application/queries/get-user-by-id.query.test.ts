import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { GetUserByIdQuery } from "./get-user-by-id.query";
import { User } from "../../domain/entities/user.entity";
import type { UsersRepository } from "../../infrastructure/repositories/users.repository";

describe("GetUserByIdQuery", () => {
  let query: GetUserByIdQuery;
  const mockFindById = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query = new GetUserByIdQuery({ findById: mockFindById } as unknown as UsersRepository);
  });

  it("should return USER_NOT_FOUND if user not found", async () => {
    // Arrange
    vi.mocked(mockFindById).mockResolvedValue(ok(null));

    // Act
    const result = await query.execute("123");

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "USER_NOT_FOUND", userId: "123" });
    }
  });

  it("should return ok(user) if found", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(mockFindById).mockResolvedValue(ok(user));

    // Act
    const result = await query.execute("123");

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(user);
    }
    expect(mockFindById).toHaveBeenCalledWith("123");
  });

  it("always uses fresh state for security-sensitive token validation", async () => {
    const user = User.fromPersistence({
      id: "fresh-user",
      email: "fresh@example.com",
      name: "Fresh",
      role: "user",
      authVersion: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(mockFindById).mockResolvedValue(ok(user));

    const result = await query.executeFresh("fresh-user");

    expect(result.isOk()).toBe(true);
    expect(mockFindById).toHaveBeenCalledWith("fresh-user");
  });

  it("returns cached user on Redis hit without querying repository", async () => {
    const cachedUserData = {
      id: "cached-user",
      email: "cached@example.com",
      name: "Cached",
      role: "user",
      avatarFileId: null,
      authVersion: 1,
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const mockRedisClient = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cachedUserData)),
      set: vi.fn(),
    };
    const mockRedis = {
      getClient: () => mockRedisClient,
    } as unknown as import("../../../../infrastructure/redis").RedisService;
    const queryWithRedis = new GetUserByIdQuery(
      { findById: mockFindById } as unknown as UsersRepository,
      mockRedis,
    );

    const result = await queryWithRedis.execute("cached-user");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe("cached-user");
      expect(result.value.email).toBe("cached@example.com");
      expect(result.value.isEmailVerified).toBe(true);
      expect(result.value.createdAt).toBeInstanceOf(Date);
    }
    expect(mockRedisClient.get).toHaveBeenCalledWith("cache:user:cached-user");
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("writes to Redis on repository fetch and fails open if Redis throws", async () => {
    const user = User.fromPersistence({
      id: "user-miss",
      email: "miss@example.com",
      name: "Miss",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(mockFindById).mockResolvedValue(ok(user));
    const mockRedisClient = {
      get: vi.fn().mockRejectedValue(new Error("Redis get timeout")),
      set: vi.fn().mockRejectedValue(new Error("Redis set timeout")),
    };
    const mockRedis = {
      getClient: () => mockRedisClient,
    } as unknown as import("../../../../infrastructure/redis").RedisService;
    const queryWithRedis = new GetUserByIdQuery(
      { findById: mockFindById } as unknown as UsersRepository,
      mockRedis,
    );

    const result = await queryWithRedis.execute("user-miss");

    expect(result.isOk()).toBe(true);
    expect(mockFindById).toHaveBeenCalledWith("user-miss");
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "cache:user:user-miss",
      expect.any(String),
      "EX",
      300,
    );
  });

  it("executeFresh bypasses Redis even when key exists in cache", async () => {
    const dbUser = User.fromPersistence({
      id: "user-fresh-check",
      email: "fresh@example.com",
      name: "Fresh",
      role: "user",
      authVersion: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(mockFindById).mockResolvedValue(ok(dbUser));
    const mockRedisClient = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ id: "user-fresh-check", authVersion: 2 })),
      set: vi.fn(),
    };
    const mockRedis = {
      getClient: () => mockRedisClient,
    } as unknown as import("../../../../infrastructure/redis").RedisService;
    const queryWithRedis = new GetUserByIdQuery(
      { findById: mockFindById } as unknown as UsersRepository,
      mockRedis,
    );

    const result = await queryWithRedis.executeFresh("user-fresh-check");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.authVersion).toBe(5);
    }
    expect(mockRedisClient.get).not.toHaveBeenCalled();
    expect(mockFindById).toHaveBeenCalledWith("user-fresh-check");
  });
});
