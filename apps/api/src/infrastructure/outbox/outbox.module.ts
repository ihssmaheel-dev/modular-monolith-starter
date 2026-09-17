import { Global, Module } from "@nestjs/common";
import { OutboxRepository } from "./repositories/outbox.repository";
import { OutboxService } from "./outbox.service";
import { OutboxRelayWorker } from "./workers/outbox-relay.worker";
import { OutboxEventWorker } from "./workers/outbox-event.worker";
import { OutboxRelayDelivery } from "./workers/outbox-relay.delivery";

@Global()
@Module({
  providers: [
    OutboxRepository,
    OutboxService,
    OutboxRelayWorker,
    OutboxEventWorker,
    OutboxRelayDelivery,
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
