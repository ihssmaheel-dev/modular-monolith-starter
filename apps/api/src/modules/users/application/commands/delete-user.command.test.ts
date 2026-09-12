import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteUserCommand } from "./delete-user.command";
import { UsersRepository } from "../../infrastructure/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { User } from "../../domain/entities/user.entity";
import { ok, err } from "neverthrow";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { CanDeleteUserQuery } from "../../../tenancy/application/queries/can-delete-user.query";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { ok as resultOk } from "neverthrow";

describe("DeleteUserCommand", () => {
  let command: DeleteUserCommand;
  let repository: UsersRepository;
  let getUserById: GetUserByIdQuery;
  let eventEmitter: EventEmitter2;
  let cacheService: DistributedCacheService;
  let canDeleteUser: CanDeleteUserQuery;
  let outbox: OutboxService;

  beforeEach(() => {
    repository = {
      deleteById: vi.fn(),
    } as unknown as UsersRepository;

    getUserById = {
      execute: vi.fn(),
    } as unknown as GetUserByIdQuery;

    eventEmitter = {
      emit: vi.fn(),
      emitAsync: vi.fn().mockResolvedValue([]),
    } as unknown as EventEmitter2;
    cacheService = { invalidateGlobal: vi.fn() } as unknown as DistributedCacheService;
    canDeleteUser = {
      execute: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as CanDeleteUserQuery;
    outbox = {
      dispatchGlobal: vi.fn().mockResolvedValue(resultOk(undefined)),
    } as unknown as OutboxService;

    command = new DeleteUserCommand(
      repository,
      getUserById,
      eventEmitter,
      cacheService,
      outbox,
      canDeleteUser,
    );
  });

  it("should return USER_NOT_FOUND if user does not exist", async () => {
    // Arrange
    vi.mocked(getUserById.execute).mockResolvedValue(
      err({ type: "USER_NOT_FOUND", userId: "123" }),
    );

    // Act
    const result = await command.execute("123");

    // Assert
    expect(result.isErr()).toBe(true);
  });

  it("should delete user, emit event, and return ok", async () => {
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
    vi.mocked(repository.deleteById).mockResolvedValue(ok(true));

    // Act
    const result = await command.execute("123");

    // Assert
    expect(result.isOk()).toBe(true);
    expect(repository.deleteById).toHaveBeenCalledWith("123");
    expect(cacheService.invalidateGlobal).toHaveBeenCalledWith("user:123");
    expect(outbox.dispatchGlobal).toHaveBeenCalledWith("user.deleted", expect.anything());
  });

  it("should return USER_NOT_FOUND if repository delete fails", async () => {
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
    vi.mocked(repository.deleteById).mockResolvedValue(ok(false));

    // Act
    const result = await command.execute("123");

    // Assert
    expect(result.isErr()).toBe(true);
  });

  it("should preserve users who own an organization", async () => {
    const user = User.fromPersistence({
      id: "123",
      email: "owner@example.com",
      name: "Owner",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(canDeleteUser.execute).mockResolvedValue(err({ type: "USER_OWNS_ORGANIZATION" }));

    const result = await command.execute("123");

    expect(result.isErr() && result.error.type).toBe("USER_OWNS_ORGANIZATION");
    expect(repository.deleteById).not.toHaveBeenCalled();
  });
});
