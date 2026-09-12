import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { VerifyEmailChangeCommand } from "./verify-email-change.command";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { User } from "../../domain/entities/user.entity";

const user = User.fromPersistence({
  id: "user-1",
  email: "new@example.com",
  name: "User",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("VerifyEmailChangeCommand", () => {
  let command: VerifyEmailChangeCommand;
  let repository: UsersRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = {
      applyEmailChangeByToken: vi.fn(),
    } as unknown as UsersRepository;
    command = new VerifyEmailChangeCommand(repository);
  });

  it("applies the pending address by token hash", async () => {
    vi.mocked(repository.applyEmailChangeByToken).mockResolvedValue(ok(user));

    const result = await command.execute("a".repeat(64));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.email).toBe("new@example.com");
    }
    const [hash] = vi.mocked(repository.applyEmailChangeByToken).mock.calls[0]!;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe("a".repeat(64));
  });

  it("rejects unknown or expired tokens", async () => {
    vi.mocked(repository.applyEmailChangeByToken).mockResolvedValue(ok(null));

    const result = await command.execute("b".repeat(64));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "INVALID_EMAIL_CHANGE_TOKEN" });
    }
  });
});
