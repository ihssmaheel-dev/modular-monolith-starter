import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateUserCommand } from "./create-user.command";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { GetUserByEmailQuery } from "../queries/get-user-by-email.query";
import { ok } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import { UserCreatedEvent } from "../../domain/events/user.events";
import * as argon2 from "@node-rs/argon2";
import { DatabaseService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";

vi.mock("@node-rs/argon2", () => ({
  hash: vi.fn(),
}));

describe("CreateUserCommand", () => {
  let command: CreateUserCommand;
  let repository: UsersRepository;
  let getUserByEmail: GetUserByEmailQuery;
  let databaseService: DatabaseService;
  let outboxService: OutboxService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
    } as unknown as UsersRepository;

    getUserByEmail = {
      execute: vi.fn(),
    } as unknown as GetUserByEmailQuery;

    databaseService = {
      withResultTransaction: vi.fn().mockImplementation(async (callback) => callback()),
    } as unknown as DatabaseService;

    outboxService = {
      dispatchGlobal: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as OutboxService;

    command = new CreateUserCommand(repository, getUserByEmail, databaseService, outboxService);
  });

  it("should return EMAIL_TAKEN if email exists", async () => {
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
      email: "test@example.com",
      name: "Test",
      password: "pwd",
    });

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "EMAIL_TAKEN", email: "test@example.com" });
    }
  });

  it("should create user, emit event, and return ok", async () => {
    // Arrange
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(null));
    vi.mocked(argon2.hash).mockResolvedValue("hashed_pwd" as never);

    const newUser = User.fromPersistence({
      id: "user-123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(repository.create).mockResolvedValue(ok(newUser));

    // Act
    const result = await command.execute({
      email: "test@example.com",
      name: "Test",
      password: "pwd",
    });

    // Assert
    expect(result.isOk()).toBe(true);
    expect(repository.create).toHaveBeenCalledWith({
      email: "test@example.com",
      name: "Test",
      passwordHash: "hashed_pwd",
      role: "user",
    });
    expect(outboxService.dispatchGlobal).toHaveBeenCalledWith(
      "user.created",
      expect.any(UserCreatedEvent),
    );
  });
});
