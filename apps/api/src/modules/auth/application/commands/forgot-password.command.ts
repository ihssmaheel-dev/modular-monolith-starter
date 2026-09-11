import { Injectable, Optional } from "@nestjs/common";
import {
  buildFrontendUrl,
  MILLISECONDS_PER_MINUTE,
  PASSWORD_RESET_TTL_MINUTES,
  FRONTEND_ROUTES,
} from "@repo/contracts";
import { ok, Result } from "neverthrow";
import { generateSecureToken, hashPasswordResetToken } from "../utils/password.utils";
import type { AuthError } from "../../domain/errors/auth.errors";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { SetPasswordResetTokenCommand } from "../../../users/application/commands/set-password-reset-token.command";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { PasswordResetEmail, render } from "@repo/email";
import { env } from "../../../../config/env";
import * as React from "react";

@Injectable()
export class ForgotPasswordCommand {
  private readonly logger?: PinoLoggerService;

  constructor(
    private readonly getUserByEmail: GetUserByEmailQuery,
    private readonly setPasswordResetToken: SetPasswordResetTokenCommand,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
    @Optional() logger?: PinoLoggerService,
  ) {
    this.logger = logger?.child({ module: "ForgotPasswordCommand" });
  }

  async execute(email: string, lang?: string): Promise<Result<void, AuthError>> {
    const result = await this.getUserByEmail.execute(email);
    if (result.isErr() || !result.value) {
      return ok(undefined);
    }

    const resetToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * MILLISECONDS_PER_MINUTE);
    const stored = await this.setPasswordResetToken.execute(
      result.value.id,
      hashPasswordResetToken(resetToken),
      expiresAt,
    );
    if (stored.isErr()) return ok(undefined);

    const resetLink = buildFrontendUrl(env.CLIENT_URL, FRONTEND_ROUTES.resetPassword, {
      token: resetToken,
    });
    const html = await render(
      React.createElement(PasswordResetEmail, {
        resetLink,
        preview: this.i18n.t("email.passwordReset.preview", lang),
        requestText: this.i18n.t("email.passwordReset.requestText", lang),
        instructionText: this.i18n.t("email.passwordReset.instructionText", lang),
        buttonText: this.i18n.t("email.passwordReset.buttonText", lang),
      }),
    );

    // send() returns a Result instead of throwing: an unchecked Err would
    // silently lose the recovery mail with no operator signal. Delivery
    // failures stay non-fatal (the endpoint must not reveal account
    // existence) but are always logged.
    try {
      const sent = await this.emailService.send({
        to: email,
        subject: this.i18n.t("email.passwordReset.subject", lang),
        html,
      });
      if (sent.isErr()) {
        this.logger?.warn({ code: sent.error.code, email }, "Password reset email failed");
      }
    } catch (error) {
      this.logger?.warn({ error, email }, "Password reset email failed");
    }

    return ok(undefined);
  }
}
