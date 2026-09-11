import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateUserCommand } from "./update-user.command";
import { UsersRepository } from "../../infrastructure/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { GetUserByEmailQuery } from "../queries/get-user-by-email.query";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { User } from "../../domain/entities/user.entity";
import { ok, err } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { ok as resultOk } from "neverthrow";

describe("UpdateUserCommand", () => {
  let command: UpdateUserCommand;
  let repository: UsersRepository;
  let getUserById: GetUserByIdQuery;
  let getUserByEmail: GetUserByEmailQuery;
  let eventEmitter: EventEmitter2;
  let distributedCacheService: DistributedCacheService;
  let outbox: OutboxService;

  beforeEach(() => {
    repository = {
      updateById: vi.fn(),
    } as unknown as UsersRepository;

    getUserById = {
      execute: vi.fn(),
    } as unknown as GetUserByIdQuery;

    getUserByEmail = {
      execute: vi.fn(),
    } as unknown as GetUserByEmailQuery;

    eventEmitter = {
      emit: vi.fn(),
      emitAsync: vi.fn().mockResolvedValue([]),
    } as unknown as EventEmitter2;

    distributedCacheService = {
      invalidateGlobal: vi.fn(),
    } as unknown as DistributedCacheService;
    outbox = {
      dispatchGlobal: vi.fn().mockResolvedValue(resultOk(undefined)),
    } as unknown as OutboxService;

    command = new UpdateUserCommand(
      repository,
      getUserById,
      getUserByEmail,
      eventEmitter,
      distributedCacheService,
      outbox,
    );
  });

  const admin: AuthenticatedUser = {
    sub: "admin-1",
    email: "admin@example.com",
    role: "admin",
  };
  const self: AuthenticatedUser = {
    sub: "123",
    email: "old@example.com",
    role: "user",
  };
  const stranger: AuthenticatedUser = {
    sub: "999",
    email: "other@example.com",
    role: "user",
  };

  it("should return USER_NOT_FOUND if user does not exist", async () => {
    // Arrange
    vi.mocked(getUserById.execute).mockResolvedValue(
      err({ type: "USER_NOT_FOUND", userId: "123" }),
    );

    // Act
    const result = await command.execute("123", { name: "New Name" }, admin);

    // Assert
    expect(result.isErr()).toBe(true);
  });

  it("should return EMAIL_TAKEN if changing email to an existing one", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "123",
      email: "old@example.com",
      name: "Old",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));

    const otherUser = User.fromPersistence({
      id: "456",
      email: "new@example.com",
      name: "Other",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(otherUser));

    // Act
    const result = await command.execute("123", { email: "new@example.com" }, admin);

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "EMAIL_TAKEN", email: "new@example.com" });
    }
  });

  it("should update user, emit event, and return ok", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "123",
      email: "old@example.com",
      name: "Old",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(repository.updateById).mockResolvedValue(ok(user));

    // Act
    const result = await command.execute("123", { name: "New Name" }, admin);

    // Assert
    expect(result.isOk()).toBe(true);
    expect(repository.updateById).toHaveBeenCalledWith("123", {
      email: "old@example.com",
      name: "New Name",
      role: "user",
    });
    expect(outbox.dispatchGlobal).toHaveBeenCalledWith("user.updated", expect.anything());
  });

  it("should forbid a non-admin editing another user (C01)", async () => {
    // Act
    const result = await command.execute("123", { name: "Hacked" }, stranger);

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "USER_FORBIDDEN", userId: "123" });
    }
    expect(repository.updateById).not.toHaveBeenCalled();
  });

  it("should let users change their own name but not their email", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "123",
      email: "old@example.com",
      name: "Old",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(repository.updateById).mockResolvedValue(ok(user));

    // Act
    const renamed = await command.execute("123", { name: "New Name" }, self);
    const emailChange = await command.execute("123", { email: "new@example.com" }, self);

    // Assert
    expect(renamed.isOk()).toBe(true);
    expect(emailChange.isErr()).toBe(true);
    if (emailChange.isErr()) {
      expect(emailChange.error).toEqual({ type: "USER_FORBIDDEN", userId: "123" });
    }
  });

  it("should record the acting principal as the audit actor", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "123",
      email: "old@example.com",
      name: "Old",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(repository.updateById).mockResolvedValue(ok(user));

    // Act
    const result = await command.execute("123", { name: "New Name" }, admin);

    // Assert
    expect(result.isOk()).toBe(true);
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      "database.mutated",
      expect.objectContaining({ actorId: "admin-1", documentId: "123" }),
    );
  });
});
