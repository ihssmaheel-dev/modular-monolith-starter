import { Module } from "@nestjs/common";
import { AuthController } from "./presentation/controllers/auth.controller";
import { AuthVerificationController } from "./presentation/controllers/auth-verification.controller";
import { RegisterCommand } from "./application/commands/register.command";
import { VerifyEmailCommand } from "./application/commands/verify-email.command";
import { SendVerificationEmailCommand } from "./application/commands/send-verification-email.command";
import { LoginCommand } from "./application/commands/login.command";
import { RefreshTokensCommand } from "./application/commands/refresh-tokens.command";
import { ForgotPasswordCommand } from "./application/commands/forgot-password.command";
import { ResetPasswordCommand } from "./application/commands/reset-password.command";
import { LogoutCommand } from "./application/commands/logout.command";
import { UsersModule } from "../users/users.module";
import { EmailModule } from "../../infrastructure/email/email.module";
import { AuthOrpcController } from "./presentation/orpc/auth.orpc.controller";

@Module({
  imports: [UsersModule, EmailModule],
  controllers: [AuthController, AuthVerificationController, AuthOrpcController],
  providers: [
    AuthController,
    AuthVerificationController,
    RegisterCommand,
    VerifyEmailCommand,
    SendVerificationEmailCommand,
    LoginCommand,
    RefreshTokensCommand,
    ForgotPasswordCommand,
    ResetPasswordCommand,
    LogoutCommand,
  ],
})
export class AuthModule {}
