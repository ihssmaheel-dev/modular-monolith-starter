import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetUserByEmailQuery } from "./get-user-by-email.query";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { User } from "../../domain/entities/user.entity";
import { ok } from "neverthrow";

describe("GetUserByEmailQuery", () => {
  let query: GetUserByEmailQuery;
  let repository: UsersRepository;

  beforeEach(() => {
    repository = {
      findOne: vi.fn(),
    } as unknown as UsersRepository;

    query = new GetUserByEmailQuery(repository);
  });

  it("should return ok(null) if user not found", async () => {
    // Arrange
    vi.mocked(repository.findOne).mockResolvedValue(ok(null));

    // Act
    const result = await query.execute("test@example.com");

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeNull();
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
    vi.mocked(repository.findOne).mockResolvedValue(ok(user));

    // Act
    const result = await query.execute("test@example.com");

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(user);
    }
    expect(repository.findOne).toHaveBeenCalledWith({ email: "test@example.com" });
  });
});
