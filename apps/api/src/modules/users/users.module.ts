import { Module } from "@nestjs/common";
import { UsersController } from "./presentation/users.controller";
import { GetUsersQuery } from "./application/queries/get-users.query";
import { GetUserByIdQuery } from "./application/queries/get-user-by-id.query";
import { GetUserByEmailQuery } from "./application/queries/get-user-by-email.query";
import { VerifyUserCredentialsQuery } from "./application/queries/verify-user-credentials.query";
import { CreateUserCommand } from "./application/commands/create-user.command";
import { UpdateUserCommand } from "./application/commands/update-user.command";
import { DeleteUserCommand } from "./application/commands/delete-user.command";
import { AnonymizeUserCommand } from "./application/commands/anonymize-user.command";
import { ResetUserPasswordCommand } from "./application/commands/reset-user-password.command";
import { SetPasswordResetTokenCommand } from "./application/commands/set-password-reset-token.command";
import { IncrementAuthVersionCommand } from "./application/commands/increment-auth-version.command";
import { UsersRepository } from "./infrastructure/users.repository";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { WelcomeEmailListener } from "./application/listeners/welcome-email.listener";
import { OutboxModule } from "../../infrastructure/outbox/outbox.module";
import { UsersOrpcController } from "./presentation/users.orpc.controller";

@Module({
  imports: [EventEmitterModule, OutboxModule],
  controllers: [UsersController, UsersOrpcController],
  providers: [
    UsersController,
    GetUsersQuery,
    GetUserByIdQuery,
    GetUserByEmailQuery,
    VerifyUserCredentialsQuery,
    CreateUserCommand,
    UpdateUserCommand,
    AnonymizeUserCommand,
    DeleteUserCommand,
    ResetUserPasswordCommand,
    SetPasswordResetTokenCommand,
    IncrementAuthVersionCommand,
    UsersRepository,
    WelcomeEmailListener,
  ],
  exports: [
    GetUsersQuery,
    GetUserByIdQuery,
    GetUserByEmailQuery,
    VerifyUserCredentialsQuery,
    CreateUserCommand,
    UpdateUserCommand,
    AnonymizeUserCommand,
    DeleteUserCommand,
    ResetUserPasswordCommand,
    SetPasswordResetTokenCommand,
    IncrementAuthVersionCommand,
  ],
})
export class UsersModule {}
