import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { ResetUserPasswordCommand } from "./reset-user-password.command";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";

const USER = User.fromPersistence({
  id: "user-1",
  email: "user@example.com",
  name: "User",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("ResetUserPasswordCommand", () => {
  let repository: UsersRepository;
  let cacheService: DistributedCacheService;
  let command: ResetUserPasswordCommand;

  beforeEach(() => {
    repository = { resetPasswordByToken: vi.fn() } as unknown as UsersRepository;
    cacheService = { invalidateGlobal: vi.fn() } as unknown as DistributedCacheService;
    command = new ResetUserPasswordCommand(repository, cacheService);
  });

  it("hashes the new password and consumes the token", async () => {
    vi.mocked(repository.resetPasswordByToken).mockResolvedValue(ok(USER));

    const result = await command.execute("token-hash", "new-password");

    expect(result.isOk()).toBe(true);
    expect(repository.resetPasswordByToken).toHaveBeenCalledWith(
      "token-hash",
      expect.stringMatching(/^\$argon2(id|i|d)\$/),
    );
    expect(cacheService.invalidateGlobal).toHaveBeenCalledWith(`user:${USER.id}`);
  });

  it("rejects an invalid or expired token", async () => {
    vi.mocked(repository.resetPasswordByToken).mockResolvedValue(ok(null));

    const result = await command.execute("invalid", "new-password");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("INVALID_PASSWORD_RESET_TOKEN");
  });
});
