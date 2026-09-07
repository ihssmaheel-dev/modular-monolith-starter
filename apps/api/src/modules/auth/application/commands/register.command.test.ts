import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterCommand } from "./register.command";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { CreateUserCommand } from "../../../users/application/commands/create-user.command";
import { ok } from "neverthrow";
import * as jwtUtils from "../utils/jwt.utils";
import { User } from "../../../users/domain/entities/user.entity";

vi.mock("../utils/jwt.utils", () => ({
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
}));

describe("RegisterCommand", () => {
  let command: RegisterCommand;
  let getUserByEmail: GetUserByEmailQuery;
  let createUser: CreateUserCommand;

  beforeEach(() => {
    vi.clearAllMocks();

    getUserByEmail = {
      execute: vi.fn(),
    } as unknown as GetUserByEmailQuery;

    createUser = {
      execute: vi.fn(),
    } as unknown as CreateUserCommand;

    command = new RegisterCommand(getUserByEmail, createUser);
  });

  it("should return EMAIL_TAKEN if user already exists", async () => {
    // Arrange
    const existingUser = User.fromPersistence({
      id: "123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(existingUser));

    // Act
    const result = await command.execute({
      name: "Test",
      email: "test@example.com",
      password: "password123",
    });

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "EMAIL_TAKEN" });
    }
    expect(createUser.execute).not.toHaveBeenCalled();
  });

  it("should create user and return tokens when email is unique", async () => {
    // Arrange
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(null));

    const newUser = User.fromPersistence({
      id: "user-123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(createUser.execute).mockResolvedValue(ok(newUser));
    vi.mocked(jwtUtils.signAccessToken).mockReturnValue("access-token");
    vi.mocked(jwtUtils.signRefreshToken).mockReturnValue("refresh-token");

    // Act
    const result = await command.execute({
      name: "Test",
      email: "test@example.com",
      password: "password123",
    });

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test",
          role: "user",
          avatarFileId: null,
        },
      });
    }
    expect(createUser.execute).toHaveBeenCalledWith(
      { email: "test@example.com", name: "Test", password: "password123" },
      "en",
    );
    expect(jwtUtils.signAccessToken).toHaveBeenCalledWith(
      "user-123",
      "test@example.com",
      "Test",
      "user",
      0,
    );
  });
});
