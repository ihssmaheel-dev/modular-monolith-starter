import { Module, type OnModuleInit } from "@nestjs/common";
import { OutboxConsumerRegistry } from "../../infrastructure/outbox/services/outbox-consumer.registry";
import { ExecuteUnaryChatCommand } from "./application/commands/execute-unary-chat.command";
import { SearchIntelligenceDocumentsQuery } from "./application/queries/search-intelligence-documents.query";
import { IntelligenceGatewayService } from "./application/services/intelligence-gateway.service";
import { IntelligenceHmacService } from "./application/services/intelligence-hmac.service";
import { IntelligenceController } from "./presentation/controllers/intelligence.controller";
import { IntelligenceOrpcController } from "./presentation/orpc/intelligence.orpc.controller";

@Module({
  controllers: [IntelligenceController, IntelligenceOrpcController],
  providers: [
    IntelligenceHmacService,
    IntelligenceGatewayService,
    ExecuteUnaryChatCommand,
    SearchIntelligenceDocumentsQuery,
  ],
  exports: [IntelligenceGatewayService, ExecuteUnaryChatCommand, SearchIntelligenceDocumentsQuery],
})
export class IntelligenceModule implements OnModuleInit {
  constructor(private readonly outboxConsumers: OutboxConsumerRegistry) {}

  onModuleInit(): void {
    // Register domain topics as observers so durable events do not trigger UNCLASSIFIED_DURABLE_EVENT
    this.outboxConsumers.registerObserverTopics([
      "note.created",
      "note.updated",
      "note.deleted",
      "privacy.account.purged",
      "privacy.organization.purged",
      "user.deleted",
    ]);
  }
}
