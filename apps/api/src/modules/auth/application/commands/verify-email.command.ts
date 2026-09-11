import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { AuthResponse } from "@repo/contracts";
import type { AuthError } from "../../domain/errors/auth.errors";
import { VerifyUserEmailCommand } from "../../../users/application/commands/verify-user-email.command";
import { signAccessToken, signRefreshToken } from "../utils/jwt.utils";
import { hashPasswordResetToken } from "../utils/password.utils";
import { SessionService } from "../../../../infrastructure/session/session.service";
import type { LoginDeviceContext } from "./login.command";

@Injectable()
export class VerifyEmailCommand {
  constructor(
    private readonly verifyUserEmail: VerifyUserEmailCommand,
    private readonly sessions: SessionService,
  ) {}

  async execute(
    token: string,
    device: LoginDeviceContext = {},
  ): Promise<Result<AuthResponse, AuthError>> {
    // Atomic consume: expiry check, verified stamp, and token nulling happen in
    // one UPDATE, so a token can never verify twice (replay-safe by construction).
    const result = await this.verifyUserEmail.execute(hashPasswordResetToken(token));
    if (result.isErr() || !result.value) return err({ type: "INVALID_TOKEN" });

    const user = result.value;
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
