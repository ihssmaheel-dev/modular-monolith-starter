import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { err } from "neverthrow";
import {
  NoDatabaseTransaction,
  Public,
  TenantAgnostic,
  requireAuthenticatedUser,
  ResponseSchema,
} from "../../../common";
import { ZodValidationPipe } from "../../../common/pipes/validation.pipe";
import { handleResult } from "../../../common/utils/presentation.utils";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import {
  type RegisterInput,
  type LoginInput,
  type RefreshTokenInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type AuthResponse,
  type CurrentUserResponse,
  type MessageResponse,
  type RegisterResponse,
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  AuthResponseSchema,
  CurrentUserResponseSchema,
  MessageResponseSchema,
  RegisterResponseSchema,
} from "@repo/contracts";
import { ForgotPasswordCommand } from "../application/commands/forgot-password.command";
import { LoginCommand } from "../application/commands/login.command";
import { LogoutCommand } from "../application/commands/logout.command";
import { RefreshTokensCommand } from "../application/commands/refresh-tokens.command";
import { RegisterCommand } from "../application/commands/register.command";
import { ResetPasswordCommand } from "../application/commands/reset-password.command";
import { clearAuthCookies, setAuthCookies } from "./auth.cookies";
import { EMAIL_TAKEN_ERRORS, INVALID_TOKEN_ERRORS, LOGIN_ERRORS } from "./auth.error-maps";
import { AuthRateLimit } from "./auth-rate-limit.decorator";
import { GetUserByIdQuery } from "../../users/application/queries/get-user-by-id.query";

@Controller("auth")
@TenantAgnostic()
export class AuthController {
  constructor(
    private readonly registerCmd: RegisterCommand,
    private readonly loginCmd: LoginCommand,
    private readonly logoutCmd: LogoutCommand,
    private readonly refreshCmd: RefreshTokensCommand,
    private readonly forgotPasswordCmd: ForgotPasswordCommand,
    private readonly resetPasswordCmd: ResetPasswordCommand,
    private readonly getUserById: GetUserByIdQuery,
    private readonly i18n: I18nService,
  ) {}

  @Get("me")
  @HttpCode(HttpStatus.OK)
  @ResponseSchema(CurrentUserResponseSchema)
  async me(@Req() req: FastifyRequest): Promise<CurrentUserResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.getUserById.execute(actor.sub);
    const user = handleResult(
      result,
      INVALID_TOKEN_ERRORS,
      this.i18n,
      req.headers["accept-language"],
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarFileId: user.avatarFileId,
      },
    };
  }

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @AuthRateLimit("register")
  @ResponseSchema(RegisterResponseSchema)
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput,
    @Req() req: FastifyRequest,
  ): Promise<RegisterResponse> {
    const locale = this.i18n.getLocale(req.headers["accept-language"]);
    const result = await this.registerCmd.execute(body, locale);
    return handleResult(result, EMAIL_TAKEN_ERRORS, this.i18n, req.headers["accept-language"]);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Public()
  @AuthRateLimit("login")
  @ResponseSchema(AuthResponseSchema)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const result = await this.loginCmd.execute(body, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const value = handleResult(result, LOGIN_ERRORS, this.i18n, req.headers["accept-language"]);
    setAuthCookies(reply, value.accessToken, value.refreshToken);
    return value;
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @NoDatabaseTransaction()
  @ResponseSchema(MessageResponseSchema)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponse> {
    const lang = req.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.logoutCmd.execute(actor.sub);
    handleResult(result, INVALID_TOKEN_ERRORS, this.i18n, lang);
    clearAuthCookies(reply);
    return { message: this.i18n.t("auth.logoutSuccess", lang) };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @NoDatabaseTransaction()
  @Public()
  @AuthRateLimit("refresh")
  @ResponseSchema(AuthResponseSchema)
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const lang = req.headers["accept-language"];
    const token =
      body?.refreshToken ?? (req.cookies as Record<string, string | undefined>)?.refresh_token;
    if (!token) {
      handleResult(err({ type: "INVALID_TOKEN" as const }), INVALID_TOKEN_ERRORS, this.i18n, lang);
    }
    const result = await this.refreshCmd.execute(token!);
    const value = handleResult(result, INVALID_TOKEN_ERRORS, this.i18n, lang);
    setAuthCookies(reply, value.accessToken, value.refreshToken);
    return value;
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("forgotPassword")
  @ResponseSchema(MessageResponseSchema)
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    const lang = req.headers["accept-language"];
    await this.forgotPasswordCmd.execute(body.email, lang);
    return { message: this.i18n.t("auth.resetLinkSent", lang) };
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("resetPassword")
  @ResponseSchema(MessageResponseSchema)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    const lang = req.headers["accept-language"];
    const result = await this.resetPasswordCmd.execute(body.token, body.password);
    handleResult(result, INVALID_TOKEN_ERRORS, this.i18n, lang);
    return { message: this.i18n.t("auth.passwordResetSuccess", lang) };
  }
}
