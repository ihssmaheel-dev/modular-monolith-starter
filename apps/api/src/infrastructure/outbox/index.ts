export { OutboxModule } from "./outbox.module";
export { OutboxService, type OutboxError } from "./outbox.service";
export { OutboxRepository, type OutboxEvent } from "./repositories/outbox.repository";
export { OutboxRelayWorker } from "./workers/outbox-relay.worker";
export { OutboxEventWorker } from "./workers/outbox-event.worker";
export {
  OUTBOX_QUEUE,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_EVENT_IN_PROGRESS,
  OUTBOX_DEDUPE_TTL_SECONDS,
  OUTBOX_PROCESSING_TTL_SECONDS,
  OUTBOX_DURABLE_QUEUE_UNAVAILABLE,
} from "./outbox.constants";
export { outboxEvents, type OutboxRow } from "./schemas/outbox.schema";
