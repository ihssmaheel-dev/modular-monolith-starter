import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { OutboxModule } from "../../infrastructure/outbox/outbox.module";
import { DatabaseModule } from "../../infrastructure/database";
import { UsersModule } from "../users/users.module";
import { NotificationsController } from "./presentation/notifications.controller";
import { NotificationsOrpcController } from "./presentation/notifications.orpc.controller";
import { SendNotificationCommand } from "./application/commands/send-notification.command";
import { MarkReadCommand } from "./application/commands/mark-read.command";
import { UpdatePreferencesCommand } from "./application/commands/update-preferences.command";
import { RegisterDeviceTokenCommand } from "./application/commands/register-device-token.command";
import { PurgeUserNotificationsCommand } from "./application/commands/purge-user-notifications.command";
import { ListNotificationsQuery } from "./application/queries/list-notifications.query";
import { GetPreferencesQuery } from "./application/queries/get-preferences.query";
import { ExportUserDataQuery } from "./application/queries/export-user-data.query";
import { DomainEventFanoutListener } from "./application/listeners/domain-event-fanout.listener";
import { DigestWorker } from "./application/workers/digest.worker";
import { NotificationsRepository } from "./infrastructure/notifications.repository";
import { PreferencesRepository } from "./infrastructure/preferences.repository";
import { DeviceTokensRepository } from "./infrastructure/device-tokens.repository";
import { BatchesRepository } from "./infrastructure/batches.repository";
import { PushDriverFactory } from "./infrastructure/push/push.factory";

@Module({
  imports: [EventEmitterModule, OutboxModule, DatabaseModule, UsersModule],
  controllers: [NotificationsController, NotificationsOrpcController],
  providers: [
    SendNotificationCommand,
    MarkReadCommand,
    UpdatePreferencesCommand,
    RegisterDeviceTokenCommand,
    PurgeUserNotificationsCommand,
    ListNotificationsQuery,
    GetPreferencesQuery,
    ExportUserDataQuery,
    DomainEventFanoutListener,
    DigestWorker,
    NotificationsRepository,
    PreferencesRepository,
    DeviceTokensRepository,
    BatchesRepository,
    PushDriverFactory,
  ],
  exports: [
    SendNotificationCommand,
    PurgeUserNotificationsCommand,
    GetPreferencesQuery,
    ExportUserDataQuery,
  ],
})
export class NotificationsModule {}
