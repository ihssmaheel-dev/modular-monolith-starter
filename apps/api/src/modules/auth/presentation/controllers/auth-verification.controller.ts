import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { NoDatabaseTransaction, Public, TenantAgnostic, ResponseSchema } from "../../../../common";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import { handleResult } from "../../../../common/utils/presentation.utils";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import {
  type VerifyEmailInput,
  type ResendVerificationInput,
  type AuthResponse,
  type MessageResponse,
  VerifyEmailSchema,
  ResendVerificationSchema,
  AuthResponseSchema,
  MessageResponseSchema,
} from "@repo/contracts";
import { VerifyEmailCommand } from "../../application/commands/verify-email.command";
import { SendVerificationEmailCommand } from "../../application/commands/send-verification-email.command";
import { setAuthCookies } from "../helpers/auth.cookies";
import { INVALID_TOKEN_ERRORS } from "../error-maps/auth.error-maps";
import { AuthRateLimit } from "../helpers/auth-rate-limit.decorator";

@Controller("auth")
@TenantAgnostic()
export class AuthVerificationController {
  constructor(
    private readonly verifyEmailCmd: VerifyEmailCommand,
    private readonly resendVerificationCmd: SendVerificationEmailCommand,
    private readonly i18n: I18nService,
  ) {}

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("verifyEmail")
  @ResponseSchema(AuthResponseSchema)
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailSchema)) body: VerifyEmailInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const result = await this.verifyEmailCmd.execute(body.token, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const value = handleResult(
      result,
      INVALID_TOKEN_ERRORS,
      this.i18n,
      req.headers["accept-language"],
    );
    setAuthCookies(reply, value.accessToken, value.refreshToken);
    return value;
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("resendVerification")
  @ResponseSchema(MessageResponseSchema)
  async resendVerification(
    @Body(new ZodValidationPipe(ResendVerificationSchema)) body: ResendVerificationInput,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    const lang = req.headers["accept-language"];
    await this.resendVerificationCmd.execute(body.email, lang);
    return { message: this.i18n.t("auth.verificationSent", lang) };
  }
}
