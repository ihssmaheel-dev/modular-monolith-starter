import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { SetEmailVerificationTokenCommand } from "./set-email-verification-token.command";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";

describe("SetEmailVerificationTokenCommand", () => {
  let command: SetEmailVerificationTokenCommand;
  let repository: UsersRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = {
      setEmailVerificationToken: vi.fn(),
    } as unknown as UsersRepository;
    command = new SetEmailVerificationTokenCommand(repository);
  });

  it("stores the hashed token with expiry", async () => {
    vi.mocked(repository.setEmailVerificationToken).mockResolvedValue(ok(true));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await command.execute("u-1", "ab".repeat(32), expiresAt);

    expect(result.isOk()).toBe(true);
    expect(repository.setEmailVerificationToken).toHaveBeenCalledWith(
      "u-1",
      "ab".repeat(32),
      expiresAt,
    );
  });
});
