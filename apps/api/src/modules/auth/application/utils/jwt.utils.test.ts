import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, signRefreshToken } from "./jwt.utils";
import { env } from "../../../../config/env";

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(),
  },
}));

describe("jwt.utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signAccessToken", () => {
    it("should sign a JWT with the correct payload and expiry", () => {
      const userId = "user-123";
      const email = "test@example.com";
      const role = "user" as const;
      vi.mocked(jwt.sign).mockImplementation(() => "mock-access-token");

      const token = signAccessToken(userId, email, "Test User", role);

      expect(token).toBe("mock-access-token");
      expect(jwt.sign).toHaveBeenCalledWith(
        { sub: userId, email, name: "Test User", role, authVersion: 0 },
        env.JWT_SECRET,
        {
          algorithm: "HS256",
          expiresIn: "15m",
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          keyid: env.JWT_ACTIVE_KEY_ID,
        },
      );
    });

    it("signs with the active rotated key", () => {
      const originalKeys = env.JWT_SIGNING_KEYS;
      const originalActiveKeyId = env.JWT_ACTIVE_KEY_ID;
      env.JWT_SIGNING_KEYS = { old: "o".repeat(32), current: "c".repeat(32) };
      env.JWT_ACTIVE_KEY_ID = "current";
      vi.mocked(jwt.sign).mockImplementation(() => "rotated-access-token");

      try {
        const token = signAccessToken("user-123", "test@example.com", "Test User", "user");

        expect(token).toBe("rotated-access-token");
        expect(jwt.sign).toHaveBeenCalledWith(
          expect.anything(),
          "c".repeat(32),
          expect.objectContaining({ keyid: "current" }),
        );
      } finally {
        env.JWT_SIGNING_KEYS = originalKeys;
        env.JWT_ACTIVE_KEY_ID = originalActiveKeyId;
      }
    });
  });

  describe("signRefreshToken", () => {
    it("should sign a refresh token with the correct payload and expiry", () => {
      const userId = "user-123";
      const version = 2;
      vi.mocked(jwt.sign).mockImplementation(() => "mock-refresh-token");

      const token = signRefreshToken(userId, version, "session-1", "jti-1");

      expect(token).toBe("mock-refresh-token");
      const [payload] = vi.mocked(jwt.sign).mock.calls[0] ?? [];
      expect(payload).toEqual({
        sub: userId,
        type: "refresh",
        version,
        jti: "jti-1",
        sid: "session-1",
      });
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: userId, type: "refresh", version }),
        env.JWT_REFRESH_SECRET,
        {
          algorithm: "HS256",
          expiresIn: "7d",
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          keyid: env.JWT_REFRESH_ACTIVE_KEY_ID,
        },
      );
    });
  });
});
