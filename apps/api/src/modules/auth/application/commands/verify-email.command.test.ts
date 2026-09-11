import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { VerifyEmailCommand } from "./verify-email.command";
import { VerifyUserEmailCommand } from "../../../users/application/commands/verify-user-email.command";
import { User } from "../../../users/domain/entities/user.entity";
import { SessionService } from "../../../../infrastructure/session/session.service";
import * as jwtUtils from "../utils/jwt.utils";

vi.mock("../utils/jwt.utils", () => ({
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
}));

describe("VerifyEmailCommand", () => {
  let command: VerifyEmailCommand;
  let users: VerifyUserEmailCommand;
  let sessions: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    users = { execute: vi.fn() } as unknown as VerifyUserEmailCommand;
    sessions = {
      create: vi.fn().mockResolvedValue({ id: "session-9", userId: "u-2" }),
    } as unknown as SessionService;
    command = new VerifyEmailCommand(users, sessions);
  });

  it("returns a session when the token consumes", async () => {
    const user = User.fromPersistence({
      id: "u-2",
      email: "grace@example.com",
      name: "Grace",
      role: "user",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(users.execute).mockResolvedValue(ok(user));
    vi.mocked(jwtUtils.signAccessToken).mockReturnValue("access-token");
    vi.mocked(jwtUtils.signRefreshToken).mockReturnValue("refresh-token");

    const result = await command.execute("a".repeat(64));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: {
          id: "u-2",
          email: "grace@example.com",
          name: "Grace",
          role: "user",
          avatarFileId: null,
        },
      });
    }
    // Token travels hashed: the raw value must never reach storage.
    const [storedHash] = vi.mocked(users.execute).mock.calls[0] as [string];
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedHash).not.toBe("a".repeat(64));
  });

  it("returns INVALID_TOKEN for unknown or expired tokens", async () => {
    vi.mocked(users.execute).mockResolvedValue(ok(null));

    const result = await command.execute("b".repeat(64));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "INVALID_TOKEN" });
    }
    expect(jwtUtils.signAccessToken).not.toHaveBeenCalled();
  });
});
