import { Controller, Req, Res } from "@nestjs/common";
import { Implement, implement } from "../../../infrastructure/orpc/orpc-runtime";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authContract } from "@repo/contracts";
import { NoDatabaseTransaction, Public, TenantAgnostic } from "../../../common";
import { AuthRateLimit } from "./auth-rate-limit.decorator";
import { invokeOrpc } from "../../../infrastructure/orpc";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { AuthController } from "./auth.controller";
import { AuthVerificationController } from "./auth-verification.controller";

@Controller("rpc")
@TenantAgnostic()
export class AuthOrpcController {
  constructor(
    private readonly authController: AuthController,
    private readonly authVerificationController: AuthVerificationController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(authContract.register)
  @Public()
  @AuthRateLimit("register")
  register(@Req() request: FastifyRequest) {
    return implement(authContract.register).handler(({ input }) =>
      invokeOrpc(
        () => this.authController.register(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.login)
  @Public()
  @AuthRateLimit("login")
  login(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return implement(authContract.login).handler(({ input }) =>
      invokeOrpc(
        () => this.authController.login(input, request, reply),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.logout)
  @NoDatabaseTransaction()
  logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return implement(authContract.logout).handler(() =>
      invokeOrpc(
        () => this.authController.logout(request, reply),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.me)
  me(@Req() request: FastifyRequest) {
    return implement(authContract.me).handler(() =>
      invokeOrpc(
        () => this.authController.me(request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.refresh)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("refresh")
  refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return implement(authContract.refresh).handler(({ input }) =>
      invokeOrpc(
        () => this.authController.refresh(input, request, reply),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.forgotPassword)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("forgotPassword")
  forgotPassword(@Req() request: FastifyRequest) {
    return implement(authContract.forgotPassword).handler(({ input }) =>
      invokeOrpc(
        () => this.authController.forgotPassword(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.resetPassword)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("resetPassword")
  resetPassword(@Req() request: FastifyRequest) {
    return implement(authContract.resetPassword).handler(({ input }) =>
      invokeOrpc(
        () => this.authController.resetPassword(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.verifyEmail)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("verifyEmail")
  verifyEmail(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return implement(authContract.verifyEmail).handler(({ input }) =>
      invokeOrpc(
        () => this.authVerificationController.verifyEmail(input, request, reply),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(authContract.resendVerification)
  @Public()
  @NoDatabaseTransaction()
  @AuthRateLimit("resendVerification")
  resendVerification(@Req() request: FastifyRequest) {
    return implement(authContract.resendVerification).handler(({ input }) =>
      invokeOrpc(
        () => this.authVerificationController.resendVerification(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
