import { describe, it, expect, vi, beforeEach } from "vitest";
import { VerifyUserCredentialsQuery } from "./verify-user-credentials.query";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { GetUserByIdQuery } from "./get-user-by-id.query";
import { User } from "../../domain/entities/user.entity";
import { ok } from "neverthrow";
import * as argon2 from "@node-rs/argon2";

vi.mock("@node-rs/argon2", () => ({
  verify: vi.fn(),
}));

describe("VerifyUserCredentialsQuery", () => {
  let query: VerifyUserCredentialsQuery;
  let repository: UsersRepository;
  let getUserById: GetUserByIdQuery;

  const credentialsResult = (id: string) =>
    ok({
      _id: { toString: () => id },
      email: "test@example.com",
      name: "Test",
      role: "user",
      authVersion: 0,
      passwordHash: "hash",
    }) as unknown as Awaited<ReturnType<UsersRepository["findByEmailWithPassword"]>>;

  beforeEach(() => {
    repository = {
      findByEmailWithPassword: vi.fn(),
    } as unknown as UsersRepository;

    getUserById = {
      execute: vi.fn(),
    } as unknown as GetUserByIdQuery;

    query = new VerifyUserCredentialsQuery(repository, getUserById);
  });

  it("should return ok(null) if user not found", async () => {
    // Arrange
    vi.mocked(repository.findByEmailWithPassword).mockResolvedValue(ok(null));

    // Act
    const result = await query.execute("test@example.com", "pwd");

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeNull();
    }
  });

  it("should return ok(null) if password does not match", async () => {
    // Arrange
    vi.mocked(repository.findByEmailWithPassword).mockResolvedValue(credentialsResult("123"));
    vi.mocked(argon2.verify).mockResolvedValue(false as never);

    // Act
    const result = await query.execute("test@example.com", "wrong");

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeNull();
    }
  });

  it("should return ok(user) if credentials are valid", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(repository.findByEmailWithPassword).mockResolvedValue(credentialsResult("123"));
    vi.mocked(argon2.verify).mockResolvedValue(true as never);
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));

    // Act
    const result = await query.execute("test@example.com", "correct");

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(user);
    }
  });
});
