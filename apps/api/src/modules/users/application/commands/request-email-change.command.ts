import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import {
  buildFrontendUrl,
  EMAIL_CHANGE_TTL_HOURS,
  FRONTEND_ROUTES,
  MILLISECONDS_PER_HOUR,
  type AuthenticatedUser,
} from "@repo/contracts";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { GetUserByEmailQuery } from "../queries/get-user-by-email.query";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { VerifyEmail, render } from "@repo/email";
import { env } from "../../../../config/env";
import * as React from "react";
import {
  generateSecureToken,
  hashSha256Token,
} from "../../../../infrastructure/security/token.utils";

import type { EmailTaken, UserNotFound } from "../../domain/errors/user.errors";

/**
 * Dedicated email-change flow (H07): changing the address that identifies
 * an account proves control of the replacement address first. Only the
 * account owner may request it (admins use PATCH :id under users:write);
 * the address is normalized before the uniqueness check; the pending
 * address is applied only through VerifyEmailChangeCommand, which also
 * revokes sessions via the auth-version bump.
 */
@Injectable()
export class RequestEmailChangeCommand {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly getUserById: GetUserByIdQuery,
    private readonly getUserByEmail: GetUserByEmailQuery,
    private readonly repository: UsersRepository,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RequestEmailChangeCommand" });
  }

  async execute(
    actor: AuthenticatedUser,
    newEmail: string,
  ): Promise<Result<void, UserNotFound | EmailTaken>> {
    // Normalize before the uniqueness check. Legacy rows written before
    // normalization may still carry mixed case; a backfill plus a
    // case-insensitive unique index is tracked follow-up work.
    const email = newEmail.toLowerCase().trim();
    const userResult = await this.getUserById.execute(actor.sub);
    if (userResult.isErr() || !userResult.value)
      return err({ type: "USER_NOT_FOUND", userId: actor.sub });
    if (userResult.value.email.toLowerCase() === email) return ok(undefined);

    const taken = await this.getUserByEmail.execute(email);
    if (taken.isErr()) return err(taken.error);
    if (taken.value) return err({ type: "EMAIL_TAKEN", email });

    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_HOURS * MILLISECONDS_PER_HOUR);
    const stored = await this.repository.setEmailChangeRequest(
      actor.sub,
      email,
      hashSha256Token(token),
      expiresAt,
    );
    if (stored.isErr()) return err({ type: "EMAIL_TAKEN", email });

    const confirmLink = buildFrontendUrl(env.CLIENT_URL, FRONTEND_ROUTES.confirmEmailChange, {
      token,
    });
    const html = await render(
      React.createElement(VerifyEmail, {
        verifyLink: confirmLink,
        preview: this.i18n.t("email.changeEmail.preview"),
        heading: this.i18n.t("email.changeEmail.heading"),
        body: this.i18n.t("email.changeEmail.body"),
        buttonText: this.i18n.t("email.changeEmail.buttonText"),
      }),
    );

    try {
      const sent = await this.emailService.send({
        to: email,
        subject: this.i18n.t("email.changeEmail.subject"),
        html,
      });
      if (sent.isErr()) {
        this.logger.warn({ code: sent.error.code, email }, "Email change request failed");
      }
    } catch (error) {
      this.logger.warn({ error, email }, "Email change request failed");
    }
    return ok(undefined);
  }
}
