import { Global, Module } from "@nestjs/common";
import { OutboxRepository } from "./repositories/outbox.repository";
import { OutboxService } from "./outbox.service";
import { OutboxRelayWorker } from "./workers/outbox-relay.worker";
import { OutboxEventWorker } from "./workers/outbox-event.worker";
import { OutboxRelayDelivery } from "./services/outbox-relay.delivery";
import { OutboxConsumerRegistry } from "./services/outbox-consumer.registry";

@Global()
@Module({
  providers: [
    OutboxRepository,
    OutboxService,
    OutboxRelayWorker,
    OutboxEventWorker,
    OutboxRelayDelivery,
    OutboxConsumerRegistry,
  ],
  exports: [OutboxService, OutboxConsumerRegistry],
})
export class OutboxModule {}
