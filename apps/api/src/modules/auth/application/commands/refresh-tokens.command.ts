import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import type { AuthResponse } from "@repo/contracts";
import type { AuthError } from "../../domain/errors/auth.errors";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.utils";
import { SessionService } from "../../../../infrastructure/session/session.service";

@Injectable()
export class RefreshTokensCommand {
  constructor(
    private readonly getUserById: GetUserByIdQuery,
    private readonly sessions: SessionService,
  ) {}

  async execute(refreshToken: string): Promise<Result<AuthResponse, AuthError>> {
    // Tokens without a unique id or session are rejected outright: every
    // rotation must be attributable to one single-use chain.
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) return err({ type: "INVALID_TOKEN" });

    const session = await this.sessions.getRefreshSession(decoded.sid);
    if (!session || session.userId !== decoded.sub) return err({ type: "INVALID_TOKEN" });

    const result = await this.getUserById.executeFresh(decoded.sub);
    if (result.isErr() || !result.value) {
      return err({ type: "USER_NOT_FOUND" });
    }

    const user = result.value;
    if (decoded.version !== user.authVersion) {
      return err({ type: "INVALID_TOKEN" });
    }
    // Consume only after the cheap checks pass, so transient lookup
    // failures do not burn an otherwise valid token. The recorded family
    // head and the issued token share one jti generated here.
    const newJti = randomUUID();
    const rotation = await this.sessions.rotateSessionRefresh(
      user.id,
      session.id,
      decoded.jti,
      newJti,
    );
    if (rotation !== "rotated") {
      if (rotation === "reused") {
        // Possible token theft: the presented token belongs to a superseded
        // chain, so revoke the whole session instead of letting the
        // descendant chain survive.
        await this.sessions.revoke(session.id);
      }
      return err({ type: "INVALID_TOKEN" });
    }
    const newAccessToken = signAccessToken(
      user.id,
      user.email,
      user.name,
      user.role,
      user.authVersion,
    );
    const newRefreshToken = signRefreshToken(user.id, user.authVersion, session.id, newJti);

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
