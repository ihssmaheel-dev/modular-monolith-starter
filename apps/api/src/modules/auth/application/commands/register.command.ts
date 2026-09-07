import { Injectable } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { z } from "zod";
import { RegisterSchema } from "@repo/contracts";
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n";
import type { AuthResponse } from "@repo/contracts";
import type { AuthError } from "../../domain/errors/auth.errors";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { CreateUserCommand } from "../../../users/application/commands/create-user.command";
import { signAccessToken, signRefreshToken } from "../utils/jwt.utils";

@Injectable()
export class RegisterCommand {
  constructor(
    private readonly getUserByEmail: GetUserByEmailQuery,
    private readonly createUser: CreateUserCommand,
  ) {}

  async execute(
    data: z.infer<typeof RegisterSchema>,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<Result<AuthResponse, AuthError>> {
    const existing = await this.getUserByEmail.execute(data.email);
    if (existing.isErr() || existing.value) {
      return err({ type: "EMAIL_TAKEN" });
    }

    const result = await this.createUser.execute(
      {
        email: data.email,
        name: data.name,
        password: data.password,
      },
      locale,
    );
    if (result.isErr()) {
      if (result.error.type === "EMAIL_TAKEN") return err({ type: "EMAIL_TAKEN" });
      return err({ type: "TRANSACTION_FAILED" });
    }

    const user = result.value;
    const accessToken = signAccessToken(
      user.id,
      user.email,
      user.name,
      user.role,
      user.authVersion,
    );
    const refreshToken = signRefreshToken(user.id, user.authVersion);

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
