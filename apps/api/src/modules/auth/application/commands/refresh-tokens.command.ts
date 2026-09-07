import { Injectable } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import type { AuthResponse } from "@repo/contracts";
import type { AuthError } from "../../domain/errors/auth.errors";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.utils";
import { SessionService } from "../../../../infrastructure/session/session.service";

const REFRESH_TOKEN_REUSE_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class RefreshTokensCommand {
  constructor(
    private readonly getUserById: GetUserByIdQuery,
    private readonly sessions?: SessionService,
  ) {}

  async execute(refreshToken: string): Promise<Result<AuthResponse, AuthError>> {
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) return err({ type: "INVALID_TOKEN" });
    if (this.sessions && decoded.jti) {
      const consumed = await this.sessions.consumeRefreshToken(
        decoded.jti,
        decoded.sub,
        REFRESH_TOKEN_REUSE_TTL_SECONDS,
      );
      if (!consumed) return err({ type: "INVALID_TOKEN" });
    }

    const result = await this.getUserById.executeFresh(decoded.sub);
    if (result.isErr() || !result.value) {
      return err({ type: "USER_NOT_FOUND" });
    }

    const user = result.value;
    if (decoded.version !== user.authVersion) {
      return err({ type: "INVALID_TOKEN" });
    }
    const newAccessToken = signAccessToken(
      user.id,
      user.email,
      user.name,
      user.role,
      user.authVersion,
    );
    const newRefreshToken = signRefreshToken(user.id, user.authVersion);

    return ok({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
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
