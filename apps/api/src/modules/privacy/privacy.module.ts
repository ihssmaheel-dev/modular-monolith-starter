import { Module, type OnModuleInit } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { OutboxModule } from "../../infrastructure/outbox/outbox.module";
import { DatabaseModule } from "../../infrastructure/database";
import { UsersModule } from "../users/users.module";
import { PrivacyController } from "./presentation/controllers/privacy.controller";
import { PrivacyOrpcController } from "./presentation/orpc/privacy.orpc.controller";
import { RequestExportCommand } from "./application/commands/request-export.command";
import { RequestAccountErasureCommand } from "./application/commands/request-account-erasure.command";
import { RequestOrganizationErasureCommand } from "./application/commands/request-organization-erasure.command";
import { PurgeExpiredErasuresCommand } from "./application/commands/purge-expired-erasures.command";
import { DownloadExportQuery } from "./application/queries/download-export.query";
import { ListRequestsQuery } from "./application/queries/list-requests.query";
import { PrivacyRepository } from "./infrastructure/repositories/privacy.repository";
import { PrivacyExportWorker } from "./application/workers/privacy-export.worker";
import { OutboxConsumerRegistry } from "../../infrastructure/outbox";

@Module({
  imports: [EventEmitterModule, OutboxModule, DatabaseModule, UsersModule],
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
    PrivacyExportWorker,
  ],
  exports: [RequestExportCommand, PurgeExpiredErasuresCommand],
})
export class PrivacyModule implements OnModuleInit {
  constructor(private readonly outboxConsumers: OutboxConsumerRegistry) {}

  onModuleInit(): void {
    this.outboxConsumers.registerObserverTopics([
      "privacy.export.requested",
      "privacy.account.erasure.requested",
      "privacy.organization.erasure.requested",
      "privacy.account.purged",
      "privacy.organization.purged",
    ]);
  }
}
