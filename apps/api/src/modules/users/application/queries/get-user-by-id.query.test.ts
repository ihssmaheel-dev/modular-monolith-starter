import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { GetUserByIdQuery } from "./get-user-by-id.query";
import { User } from "../../domain/entities/user.entity";
import type { UsersRepository } from "../../infrastructure/repositories/users.repository";
import type { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";

describe("GetUserByIdQuery", () => {
  let query: GetUserByIdQuery;
  const mockFindById = vi.fn();
  const mockCacheGetOrSet = vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
    fetcher(),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    query = new GetUserByIdQuery(
      { findById: mockFindById } as unknown as UsersRepository,
      { getOrSet: mockCacheGetOrSet } as unknown as DistributedCacheService,
    );
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

  it("can bypass the cache for security-sensitive token validation", async () => {
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
    expect(mockCacheGetOrSet).not.toHaveBeenCalled();
    expect(mockFindById).toHaveBeenCalledWith("fresh-user");
  });
});
