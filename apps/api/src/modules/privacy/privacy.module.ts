import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { OutboxModule } from "../../infrastructure/outbox/outbox.module";
import { DatabaseModule } from "../../infrastructure/database";
import { UsersModule } from "../users/users.module";
import { NotesModule } from "../notes/notes.module";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrivacyController } from "./presentation/privacy.controller";
import { PrivacyOrpcController } from "./presentation/privacy.orpc.controller";
import { RequestExportCommand } from "./application/commands/request-export.command";
import { RequestAccountErasureCommand } from "./application/commands/request-account-erasure.command";
import { RequestOrganizationErasureCommand } from "./application/commands/request-organization-erasure.command";
import { PurgeExpiredErasuresCommand } from "./application/commands/purge-expired-erasures.command";
import { DownloadExportQuery } from "./application/queries/download-export.query";
import { ListRequestsQuery } from "./application/queries/list-requests.query";
import { PrivacyRepository } from "./infrastructure/repositories/privacy.repository";

@Module({
  imports: [
    EventEmitterModule,
    OutboxModule,
    DatabaseModule,
    UsersModule,
    NotesModule,
    FilesModule,
    NotificationsModule,
  ],
  controllers: [PrivacyController, PrivacyOrpcController],
  providers: [
    PrivacyController,
    RequestExportCommand,
    RequestAccountErasureCommand,
    RequestOrganizationErasureCommand,
    PurgeExpiredErasuresCommand,
    DownloadExportQuery,
    ListRequestsQuery,
    PrivacyRepository,
  ],
  exports: [RequestExportCommand, PurgeExpiredErasuresCommand],
})
export class PrivacyModule {}
