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
import { SetEmailVerificationTokenCommand } from "./application/commands/set-email-verification-token.command";
import { VerifyUserEmailCommand } from "./application/commands/verify-user-email.command";
import { IncrementAuthVersionCommand } from "./application/commands/increment-auth-version.command";
import { AttachUserAvatarCommand } from "./application/commands/attach-user-avatar.command";
import { RemoveUserAvatarCommand } from "./application/commands/remove-user-avatar.command";
import { RequestEmailChangeCommand } from "./application/commands/request-email-change.command";
import { VerifyEmailChangeCommand } from "./application/commands/verify-email-change.command";
import { UsersRepository } from "./infrastructure/repositories/users.repository";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { WelcomeEmailListener } from "./application/listeners/welcome-email.listener";
import { OutboxModule } from "../../infrastructure/outbox/outbox.module";
import { FilesModule } from "../files/files.module";
import { UsersOrpcController } from "./presentation/users.orpc.controller";
import { UsersEmailChangeController } from "./presentation/users-email-change.controller";

@Module({
  imports: [EventEmitterModule, OutboxModule, FilesModule],
  controllers: [UsersController, UsersEmailChangeController, UsersOrpcController],
  providers: [
    UsersController,
    UsersEmailChangeController,
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
    SetEmailVerificationTokenCommand,
    VerifyUserEmailCommand,
    IncrementAuthVersionCommand,
    AttachUserAvatarCommand,
    RemoveUserAvatarCommand,
    RequestEmailChangeCommand,
    VerifyEmailChangeCommand,
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
    SetEmailVerificationTokenCommand,
    VerifyUserEmailCommand,
    IncrementAuthVersionCommand,
    AttachUserAvatarCommand,
    RemoveUserAvatarCommand,
  ],
})
export class UsersModule {}
