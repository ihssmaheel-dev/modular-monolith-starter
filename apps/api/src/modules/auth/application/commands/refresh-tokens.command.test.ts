import { describe, it, expect, vi, beforeEach } from "vitest";
import { RefreshTokensCommand } from "./refresh-tokens.command";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { ok, err } from "neverthrow";
import * as jwtUtils from "../utils/jwt.utils";
import { User } from "../../../users/domain/entities/user.entity";

vi.mock("../utils/jwt.utils", () => ({
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

describe("RefreshTokensCommand", () => {
  let command: RefreshTokensCommand;
  let getUserById: GetUserByIdQuery;

  beforeEach(() => {
    vi.clearAllMocks();

    getUserById = {
      execute: vi.fn(),
    } as unknown as GetUserByIdQuery;

    command = new RefreshTokensCommand(getUserById);
  });

  it("should return err INVALID_TOKEN if token is invalid", async () => {
    vi.mocked(jwtUtils.verifyRefreshToken).mockReturnValue(null);

    const result = await command.execute("invalid-token");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "INVALID_TOKEN" });
    }
  });

  it("should return err USER_NOT_FOUND if user does not exist", async () => {
    vi.mocked(jwtUtils.verifyRefreshToken).mockReturnValue({
      sub: "user-123",
      type: "refresh",
      version: 0,
    });
    vi.mocked(getUserById.execute).mockResolvedValue(
      err({ type: "USER_NOT_FOUND", userId: "user-123" }),
    );

    const result = await command.execute("valid-refresh-token");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "USER_NOT_FOUND" });
    }
  });

  it("should return ok with new tokens if token is valid and user exists", async () => {
    vi.mocked(jwtUtils.verifyRefreshToken).mockReturnValue({
      sub: "user-123",
      type: "refresh",
      version: 0,
    });

    const user = User.fromPersistence({
      id: "user-123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      authVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(jwtUtils.signAccessToken).mockReturnValue("new-access");
    vi.mocked(jwtUtils.signRefreshToken).mockReturnValue("new-refresh");

    const result = await command.execute("valid-refresh-token");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test",
          role: "user",
          avatarFileId: null,
        },
      });
    }
    expect(jwtUtils.verifyRefreshToken).toHaveBeenCalledWith("valid-refresh-token");
    expect(jwtUtils.signAccessToken).toHaveBeenCalledWith(
      "user-123",
      "test@example.com",
      "Test",
      "user",
      0,
    );
    expect(jwtUtils.signRefreshToken).toHaveBeenCalledWith("user-123", 0);
  });

  it("rejects a refresh token issued before a password change", async () => {
    vi.mocked(jwtUtils.verifyRefreshToken).mockReturnValue({
      sub: "user-123",
      type: "refresh",
      version: 1,
    });
    const user = User.fromPersistence({
      id: "user-123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      authVersion: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));

    const result = await command.execute("old-refresh-token");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("INVALID_TOKEN");
  });
});
