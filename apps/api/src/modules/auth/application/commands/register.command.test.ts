import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterCommand } from "./register.command";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { CreateUserCommand } from "../../../users/application/commands/create-user.command";
import { SendVerificationEmailCommand } from "./send-verification-email.command";
import { ok } from "neverthrow";
import { User } from "../../../users/domain/entities/user.entity";

describe("RegisterCommand", () => {
  let command: RegisterCommand;
  let getUserByEmail: GetUserByEmailQuery;
  let createUser: CreateUserCommand;
  let sendVerificationEmail: SendVerificationEmailCommand;

  beforeEach(() => {
    vi.clearAllMocks();

    getUserByEmail = {
      execute: vi.fn(),
    } as unknown as GetUserByEmailQuery;

    createUser = {
      execute: vi.fn(),
    } as unknown as CreateUserCommand;

    sendVerificationEmail = {
      execute: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as SendVerificationEmailCommand;

    command = new RegisterCommand(getUserByEmail, createUser, sendVerificationEmail);
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
    expect(sendVerificationEmail.execute).not.toHaveBeenCalled();
  });

  it("should create user without session and send verification email", async () => {
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
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test",
          role: "user",
          avatarFileId: null,
        },
        requiresEmailVerification: true,
      });
      expect("accessToken" in result.value).toBe(false);
    }
    expect(createUser.execute).toHaveBeenCalledWith(
      { email: "test@example.com", name: "Test", password: "password123" },
      "en",
    );
    expect(sendVerificationEmail.execute).toHaveBeenCalledWith("test@example.com", "en");
  });

  it("should pass the request locale to the verification email", async () => {
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

    // Act
    const result = await command.execute(
      {
        name: "Test",
        email: "test@example.com",
        password: "password123",
      },
      "es",
    );

    // Assert
    expect(result.isOk()).toBe(true);
    expect(sendVerificationEmail.execute).toHaveBeenCalledWith("test@example.com", "es");
  });
});
