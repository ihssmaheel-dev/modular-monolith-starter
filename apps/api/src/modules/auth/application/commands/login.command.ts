import { Injectable } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { z } from "zod";
import { LoginSchema } from "@repo/contracts";
import type { AuthResponse } from "@repo/contracts";
import type { AuthError } from "../../domain/errors/auth.errors";
import { VerifyUserCredentialsQuery } from "../../../users/application/queries/verify-user-credentials.query";
import { signAccessToken, signRefreshToken } from "../utils/jwt.utils";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { AccountLockoutService } from "../../../../infrastructure/security/account-lockout.service";
import { SessionService } from "../../../../infrastructure/session/session.service";

export interface LoginDeviceContext {
  ip?: string;
  userAgent?: string;
  deviceName?: string;
}

@Injectable()
export class LoginCommand {
  constructor(
    private readonly verifyCredentials: VerifyUserCredentialsQuery,
    private readonly metricsService: MetricsService,
    private readonly lockoutService: AccountLockoutService,
    private readonly sessions: SessionService,
  ) {}

  async execute(
    data: z.infer<typeof LoginSchema>,
    device: LoginDeviceContext = {},
  ): Promise<Result<AuthResponse, AuthError>> {
    if (await this.lockoutService.isLockedOut(data.email)) {
      this.metricsService.incrementCounter(
        "auth_lockout_rejected_total",
        "Rejected logins due to lockout",
      );
      return err({ type: "ACCOUNT_LOCKED" });
    }

    const result = await this.verifyCredentials.execute(data.email, data.password);
    if (result.isErr() || !result.value) {
      await this.lockoutService.recordFailedAttempt(data.email);
      this.metricsService.incrementCounter(
        "auth_failed_logins_total",
        "Total number of failed logins",
      );
      return err({ type: "INVALID_CREDENTIALS" });
    }

    await this.lockoutService.resetAttempts(data.email);

    const user = result.value;
    if (!user.isEmailVerified) {
      // Correct password but unverified address: no tokens, no success metric,
      // and no lockout increment (this is not a credential failure).
      return err({ type: "EMAIL_NOT_VERIFIED" });
    }
    const session = await this.sessions.create({
      userId: user.id,
      ip: device.ip ?? "unknown",
      userAgent: device.userAgent ?? "unknown",
      deviceName: device.deviceName ?? "unknown",
    });
    const accessToken = signAccessToken(
      user.id,
      user.email,
      user.name,
      user.role,
      user.authVersion,
    );
    const refreshToken = signRefreshToken(user.id, user.authVersion, session.id);

    this.metricsService.incrementCounter(
      "auth_successful_logins_total",
      "Total number of successful logins",
    );

    return ok({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarFileId: user.avatarFileId,
      },
    });
  }
}
