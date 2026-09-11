import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginCommand } from "./login.command";
import { VerifyUserCredentialsQuery } from "../../../users/application/queries/verify-user-credentials.query";
import { ok } from "neverthrow";
import * as jwtUtils from "../utils/jwt.utils";
import { User } from "../../../users/domain/entities/user.entity";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { AccountLockoutService } from "../../../../infrastructure/security/account-lockout.service";

vi.mock("../utils/jwt.utils", () => ({
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
}));

describe("LoginCommand", () => {
  let command: LoginCommand;
  let verifyCredentials: VerifyUserCredentialsQuery;
  let metricsService: MetricsService;
  let lockoutService: AccountLockoutService;

  beforeEach(() => {
    vi.clearAllMocks();

    verifyCredentials = {
      execute: vi.fn(),
    } as unknown as VerifyUserCredentialsQuery;

    metricsService = {
      incrementCounter: vi.fn(),
    } as unknown as MetricsService;

    lockoutService = {
      isLockedOut: vi.fn().mockResolvedValue(false),
      recordFailedAttempt: vi.fn(),
      resetAttempts: vi.fn(),
    } as unknown as AccountLockoutService;

    command = new LoginCommand(verifyCredentials, metricsService, lockoutService);
  });

  it("should return ok with tokens and user data when credentials are valid", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      role: "user",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(verifyCredentials.execute).mockResolvedValue(ok(user));
    vi.mocked(jwtUtils.signAccessToken).mockReturnValue("access-token");
    vi.mocked(jwtUtils.signRefreshToken).mockReturnValue("refresh-token");

    // Act
    const result = await command.execute({ email: "test@example.com", password: "password123" });

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          role: "user",
          avatarFileId: null,
        },
      });
    }

    expect(verifyCredentials.execute).toHaveBeenCalledWith("test@example.com", "password123");
    expect(jwtUtils.signAccessToken).toHaveBeenCalledWith(
      "user-123",
      "test@example.com",
      "Test User",
      "user",
      0,
    );
    expect(jwtUtils.signRefreshToken).toHaveBeenCalledWith("user-123", 0);
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "auth_successful_logins_total",
      "Total number of successful logins",
    );
    expect(lockoutService.resetAttempts).toHaveBeenCalledWith("test@example.com");
  });

  it("should return err INVALID_CREDENTIALS when credentials are invalid", async () => {
    // Arrange
    vi.mocked(verifyCredentials.execute).mockResolvedValue(ok(null));

    // Act
    const result = await command.execute({ email: "test@example.com", password: "wrong" });

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "INVALID_CREDENTIALS" });
    }
    expect(jwtUtils.signAccessToken).not.toHaveBeenCalled();
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "auth_failed_logins_total",
      "Total number of failed logins",
    );
    expect(lockoutService.recordFailedAttempt).toHaveBeenCalledWith("test@example.com");
  });

  it("should return err ACCOUNT_LOCKED when account is locked out", async () => {
    vi.mocked(lockoutService.isLockedOut).mockResolvedValue(true);

    const result = await command.execute({ email: "test@example.com", password: "password123" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "ACCOUNT_LOCKED" });
    }
    expect(verifyCredentials.execute).not.toHaveBeenCalled();
  });

  it("should return err EMAIL_NOT_VERIFIED for correct credentials on unverified accounts", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(verifyCredentials.execute).mockResolvedValue(ok(user));

    // Act
    const result = await command.execute({ email: "test@example.com", password: "password123" });

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "EMAIL_NOT_VERIFIED" });
    }
    expect(jwtUtils.signAccessToken).not.toHaveBeenCalled();
    expect(lockoutService.recordFailedAttempt).not.toHaveBeenCalled();
    expect(metricsService.incrementCounter).not.toHaveBeenCalledWith(
      "auth_successful_logins_total",
      expect.anything(),
    );
  });
});
