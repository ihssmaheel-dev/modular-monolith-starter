import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AnonymizeUserCommand, anonymizedEmail } from "./anonymize-user.command";
import { UsersRepository } from "../../infrastructure/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { User } from "../../domain/entities/user.entity";

describe("AnonymizeUserCommand", () => {
  let command: AnonymizeUserCommand;
  let repository: UsersRepository;
  let getUserById: GetUserByIdQuery;
  let cacheService: DistributedCacheService;
  let events: EventEmitter2;

  const user = User.fromPersistence({
    id: "user-1",
    email: "old@example.com",
    name: "Old",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    repository = { updateById: vi.fn() } as unknown as UsersRepository;
    getUserById = { execute: vi.fn() } as unknown as GetUserByIdQuery;
    cacheService = { invalidateGlobal: vi.fn() } as unknown as DistributedCacheService;
    events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    command = new AnonymizeUserCommand(repository, getUserById, cacheService, events);
  });

  it("should return USER_NOT_FOUND when the user does not exist", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(err({ type: "USER_NOT_FOUND", userId: "x" }));

    const result = await command.execute("x");

    expect(result.isErr()).toBe(true);
  });

  it("should scrub identifiers, clear secrets, and emit user.updated", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(repository.updateById).mockResolvedValue(ok(user));

    const result = await command.execute("user-1");

    expect(result.isOk()).toBe(true);
    expect(repository.updateById).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        email: anonymizedEmail("user-1"),
        name: "Deleted User",
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      }),
    );
    expect(cacheService.invalidateGlobal).toHaveBeenCalledWith("user:user-1");
    expect(events.emitAsync).toHaveBeenCalledWith("user.updated", expect.anything());
  });
});
