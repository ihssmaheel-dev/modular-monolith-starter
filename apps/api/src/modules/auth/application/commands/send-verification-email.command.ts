import { Injectable } from "@nestjs/common";
import {
  buildFrontendUrl,
  EMAIL_VERIFICATION_TTL_HOURS,
  FRONTEND_ROUTES,
  MILLISECONDS_PER_HOUR,
} from "@repo/contracts";
import { ok, type Result } from "neverthrow";
import type { AuthError } from "../../domain/errors/auth.errors";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { SetEmailVerificationTokenCommand } from "../../../users/application/commands/set-email-verification-token.command";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { VerifyEmail, render } from "@repo/email";
import { env } from "../../../../config/env";
import * as React from "react";
import { generateSecureToken, hashPasswordResetToken } from "../utils/password.utils";

@Injectable()
export class SendVerificationEmailCommand {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly getUserByEmail: GetUserByEmailQuery,
    private readonly setVerificationToken: SetEmailVerificationTokenCommand,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "SendVerificationEmailCommand" });
  }

  async execute(email: string, lang?: string): Promise<Result<void, AuthError>> {
    const result = await this.getUserByEmail.execute(email);
    // Silent for unknown or already-verified addresses: verification state must
    // not be enumerable (same contract as forgot-password).
    if (result.isErr() || !result.value || result.value.isEmailVerified) {
      return ok(undefined);
    }

    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * MILLISECONDS_PER_HOUR);
    // Shared sha256 helper (named for resets): one hash primitive for all tokens.
    const stored = await this.setVerificationToken.execute(
      result.value.id,
      hashPasswordResetToken(token),
      expiresAt,
    );
    if (stored.isErr()) return ok(undefined);

    const verifyLink = buildFrontendUrl(env.CLIENT_URL, FRONTEND_ROUTES.verifyEmail, { token });
    const html = await render(
      React.createElement(VerifyEmail, {
        verifyLink,
        preview: this.i18n.t("email.verifyEmail.preview", lang),
        heading: this.i18n.t("email.verifyEmail.heading", lang),
        body: this.i18n.t("email.verifyEmail.body", lang),
        buttonText: this.i18n.t("email.verifyEmail.buttonText", lang),
      }),
    );

    // send() returns a Result instead of throwing: an unchecked Err would
    // silently lose the verification mail and prevent activation with no
    // operator signal. Delivery failures stay non-fatal (the endpoint must
    // not reveal account existence) but are always logged.
    let delivered = false;
    try {
      const sent = await this.emailService.send({
        to: email,
        subject: this.i18n.t("email.verifyEmail.subject", lang),
        html,
      });
      if (sent.isErr()) {
        this.logger.warn({ code: sent.error.code, email }, "Verification email failed");
      } else {
        delivered = true;
      }
    } catch (error) {
      this.logger.warn({ error, email }, "Verification email failed");
    }
    this.logger.info({ email, delivered }, "Verification email processed");

    return ok(undefined);
  }
}
