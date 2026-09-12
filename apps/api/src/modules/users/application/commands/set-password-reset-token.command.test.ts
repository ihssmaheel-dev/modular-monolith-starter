import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { SetPasswordResetTokenCommand } from "./set-password-reset-token.command";

describe("SetPasswordResetTokenCommand", () => {
  let repository: UsersRepository;
  let command: SetPasswordResetTokenCommand;

  beforeEach(() => {
    repository = { setPasswordResetToken: vi.fn() } as unknown as UsersRepository;
    command = new SetPasswordResetTokenCommand(repository);
  });

  it("stores the reset-token hash and expiry", async () => {
    const expiresAt = new Date("2026-08-11T12:00:00.000Z");
    vi.mocked(repository.setPasswordResetToken).mockResolvedValue(ok(true));

    const result = await command.execute("user-1", "token-hash", expiresAt);

    expect(result.isOk()).toBe(true);
    expect(repository.setPasswordResetToken).toHaveBeenCalledWith(
      "user-1",
      "token-hash",
      expiresAt,
    );
  });

  it("returns USER_NOT_FOUND when no user was updated", async () => {
    vi.mocked(repository.setPasswordResetToken).mockResolvedValue(ok(false));

    const result = await command.execute("missing", "token-hash", new Date());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("USER_NOT_FOUND");
  });
});
