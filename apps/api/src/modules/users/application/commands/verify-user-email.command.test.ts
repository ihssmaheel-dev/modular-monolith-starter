import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { VerifyUserEmailCommand } from "./verify-user-email.command";
import { UsersRepository } from "../../infrastructure/users.repository";
import { User } from "../../domain/entities/user.entity";

describe("VerifyUserEmailCommand", () => {
  let command: VerifyUserEmailCommand;
  let repository: UsersRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = {
      verifyEmailByToken: vi.fn(),
    } as unknown as UsersRepository;
    command = new VerifyUserEmailCommand(repository);
  });

  it("returns the verified user on consume", async () => {
    const user = User.fromPersistence({
      id: "u-1",
      email: "u@e.test",
      name: "U",
      role: "user",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(repository.verifyEmailByToken).mockResolvedValue(ok(user));

    const result = await command.execute("ab".repeat(32));

    expect(result.isOk()).toBe(true);
    expect(repository.verifyEmailByToken).toHaveBeenCalledWith("ab".repeat(32));
  });

  it("returns INVALID_VERIFICATION_TOKEN when nothing consumes", async () => {
    vi.mocked(repository.verifyEmailByToken).mockResolvedValue(ok(null));

    const result = await command.execute("ab".repeat(32));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "INVALID_VERIFICATION_TOKEN" });
    }
  });
});
