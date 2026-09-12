import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  Idempotent,
  Public,
  TenantAgnostic,
  requireAuthenticatedUser,
  ResponseSchema,
} from "../../../../common";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import {
  type MessageResponse,
  type RequestEmailChangeInput,
  type VerifyEmailChangeInput,
  type UserResponse,
  RequestEmailChangeSchema,
  VerifyEmailChangeSchema,
  MessageResponseSchema,
  UserResponseSchema,
} from "@repo/contracts";
import { RequestEmailChangeCommand } from "../../application/commands/request-email-change.command";
import { VerifyEmailChangeCommand } from "../../application/commands/verify-email-change.command";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { handleResult } from "../../../../common/utils/presentation.utils";
import { toUserResponse } from "../mappers/users.mapper";

/**
 * Self-service email-change flow (H07), kept apart from administrative user
 * management: changing the login identity proves control of the replacement
 * address first, then applies atomically with session revocation.
 */
@Controller("users")
@TenantAgnostic()
export class UsersEmailChangeController {
  constructor(
    private readonly requestEmailChangeCommand: RequestEmailChangeCommand,
    private readonly verifyEmailChangeCommand: VerifyEmailChangeCommand,
    private readonly i18n: I18nService,
  ) {}

  @Post("me/email-change/request")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @ResponseSchema(MessageResponseSchema)
  async requestEmailChange(
    @Body(new ZodValidationPipe(RequestEmailChangeSchema)) body: RequestEmailChangeInput,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    // No permission decorator: every authenticated user may request an
    // email change for their own account. The command enforces self-scope.
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.requestEmailChangeCommand.execute(actor, body.email);
    handleResult(
      result,
      {
        USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
        EMAIL_TAKEN: { status: HttpStatus.CONFLICT, i18nKey: "api.user.emailTaken" },
      },
      this.i18n,
      lang,
    );
    return { message: this.i18n.t("api.user.emailChangeRequested", lang) };
  }

  @Post("email-change/verify")
  @HttpCode(HttpStatus.OK)
  @Public()
  @Idempotent()
  @ResponseSchema(UserResponseSchema)
  async verifyEmailChange(
    @Body(new ZodValidationPipe(VerifyEmailChangeSchema)) body: VerifyEmailChangeInput,
    @Req() req: FastifyRequest,
  ): Promise<UserResponse> {
    // Public by design: the single-use token link is the capability, and
    // the user may be logged out (or logged in elsewhere) when clicking it.
    const result = await this.verifyEmailChangeCommand.execute(body.token);
    const user = handleResult(
      result,
      {
        INVALID_EMAIL_CHANGE_TOKEN: {
          status: HttpStatus.UNAUTHORIZED,
          i18nKey: "api.user.invalidEmailChangeToken",
        },
      },
      this.i18n,
      req?.headers["accept-language"],
    );
    return toUserResponse(user);
  }
}
