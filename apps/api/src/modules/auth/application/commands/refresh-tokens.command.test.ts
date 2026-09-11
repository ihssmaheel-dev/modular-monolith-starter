import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { RefreshTokensCommand } from "./refresh-tokens.command";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { SessionService } from "../../../../infrastructure/session/session.service";
import * as jwtUtils from "../utils/jwt.utils";

vi.mock("../utils/jwt.utils", async (importOriginal) => {
  const actual = await importOriginal<typeof jwtUtils>();
  return {
    ...actual,
    signAccessToken: vi.fn(() => "access-token"),
    signRefreshToken: vi.fn(() => "refresh-token"),
    verifyRefreshToken: vi.fn(),
  };
});

const user = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  role: "user",
  authVersion: 3,
  avatarFileId: null,
} as const;

const session = {
  id: "session-1",
  userId: "user-1",
  ip: "127.0.0.1",
  userAgent: "test",
  deviceName: "test",
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
};

function decoded(overrides: Record<string, unknown> = {}) {
  return {
    sub: "user-1",
    type: "refresh",
    version: 3,
    jti: "jti-old",
    sid: "session-1",
    ...overrides,
  };
}

describe("RefreshTokensCommand", () => {
  let command: RefreshTokensCommand;
  let getUserById: GetUserByIdQuery;
  let sessions: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    getUserById = {
      executeFresh: vi.fn().mockResolvedValue(ok({ ...user } as never)),
    } as unknown as GetUserByIdQuery;
    sessions = {
      getRefreshSession: vi.fn().mockResolvedValue(session),
      rotateSessionRefresh: vi.fn().mockResolvedValue("rotated"),
      revoke: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionService;
    command = new RefreshTokensCommand(getUserById, sessions);
    vi.mocked(jwtUtils.verifyRefreshToken).mockReturnValue(decoded() as never);
  });

  it("rotates the session chain and issues tokens bound to the same session", async () => {
    const result = await command.execute("refresh-token");

    expect(result.isOk()).toBe(true);
    expect(sessions.rotateSessionRefresh).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "jti-old",
      expect.any(String),
    );
    const [, , , issuedJti] = vi.mocked(sessions.rotateSessionRefresh).mock.calls[0]!;
    expect(jwtUtils.signRefreshToken).toHaveBeenCalledWith("user-1", 3, "session-1", issuedJti);
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it("rejects tokens without a token id or session", async () => {
    vi.mocked(jwtUtils.verifyRefreshToken).mockReturnValue(null);

    const result = await command.execute("legacy-or-forged-token");

    expect(result.isErr()).toBe(true);
    expect(sessions.rotateSessionRefresh).not.toHaveBeenCalled();
  });

  it("rejects refresh for a missing or foreign session", async () => {
    vi.mocked(sessions.getRefreshSession).mockResolvedValue(null);

    const missing = await command.execute("refresh-token");
    expect(missing.isErr()).toBe(true);

    vi.mocked(sessions.getRefreshSession).mockResolvedValue({ ...session, userId: "user-2" });
    const foreign = await command.execute("refresh-token");
    expect(foreign.isErr()).toBe(true);
    expect(sessions.rotateSessionRefresh).not.toHaveBeenCalled();
  });

  it("revokes the session when a superseded token is replayed", async () => {
    vi.mocked(sessions.rotateSessionRefresh).mockResolvedValue("reused");

    const result = await command.execute("refresh-token");

    expect(result.isErr()).toBe(true);
    expect(sessions.revoke).toHaveBeenCalledWith("session-1");
    expect(jwtUtils.signRefreshToken).not.toHaveBeenCalled();
  });

  it("fails closed when rotation state is unavailable", async () => {
    vi.mocked(sessions.rotateSessionRefresh).mockResolvedValue("unavailable");

    const result = await command.execute("refresh-token");

    expect(result.isErr()).toBe(true);
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it("checks the user and version before consuming the token", async () => {
    vi.mocked(getUserById.executeFresh).mockResolvedValue(ok({ ...user, authVersion: 4 } as never));

    const result = await command.execute("refresh-token");

    expect(result.isErr()).toBe(true);
    expect(sessions.rotateSessionRefresh).not.toHaveBeenCalled();
  });
});
