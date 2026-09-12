import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { IncrementAuthVersionCommand } from "./increment-auth-version.command";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";

const USER = User.fromPersistence({
  id: "user-1",
  email: "user@example.com",
  name: "User",
  role: "user",
  authVersion: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("IncrementAuthVersionCommand", () => {
  let repository: UsersRepository;
  let cacheService: DistributedCacheService;
  let events: { emitAsync: ReturnType<typeof vi.fn> };
  let command: IncrementAuthVersionCommand;

  beforeEach(() => {
    repository = { incrementAuthVersion: vi.fn() } as unknown as UsersRepository;
    cacheService = { invalidateGlobal: vi.fn() } as unknown as DistributedCacheService;
    events = { emitAsync: vi.fn().mockResolvedValue([]) };
    command = new IncrementAuthVersionCommand(repository, cacheService, events as never);
  });

  it("returns the user after invalidating prior refresh tokens", async () => {
    vi.mocked(repository.incrementAuthVersion).mockResolvedValue(ok(USER));

    const result = await command.execute(USER.id);

    expect(result.isOk()).toBe(true);
    expect(repository.incrementAuthVersion).toHaveBeenCalledWith(USER.id);
    expect(cacheService.invalidateGlobal).toHaveBeenCalledWith(`user:${USER.id}`);
    expect(events.emitAsync).toHaveBeenCalledWith("user.auth-version.incremented", {
      userId: USER.id,
      authVersion: USER.authVersion,
    });
  });

  it("returns USER_NOT_FOUND when the user is missing", async () => {
    vi.mocked(repository.incrementAuthVersion).mockResolvedValue(ok(null));

    const result = await command.execute("missing");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("USER_NOT_FOUND");
  });
});
