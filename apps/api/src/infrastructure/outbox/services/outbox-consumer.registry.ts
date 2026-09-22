import { Injectable, Optional } from "@nestjs/common";
import type { OutboxEventEnvelope, OutboxEventMetadata } from "@repo/contracts";
import type { Result } from "neverthrow";
import { MetricsService } from "../../metrics/metrics.service";

export interface OutboxConsumerRegistration {
  id: string;
  topics: readonly string[];
  handle: (payload: unknown, metadata: OutboxEventMetadata) => Promise<Result<void, unknown>>;
}

@Injectable()
export class OutboxConsumerRegistry {
  private readonly consumersByTopic = new Map<string, OutboxConsumerRegistration[]>();
  private readonly consumerIds = new Set<string>();
  private readonly observerOnlyTopics = new Set<string>();

  constructor(@Optional() private readonly metrics?: MetricsService) {}

  register(registration: OutboxConsumerRegistration): void {
    if (this.consumerIds.has(registration.id)) {
      throw new Error(`Duplicate outbox consumer registration: ${registration.id}`);
    }
    if (registration.topics.length === 0) {
      throw new Error(`Outbox consumer has no topics: ${registration.id}`);
    }

    this.consumerIds.add(registration.id);
    for (const topic of registration.topics) {
      const consumers = this.consumersByTopic.get(topic) ?? [];
      consumers.push(registration);
      this.consumersByTopic.set(topic, consumers);
    }
  }

  registerObserverTopics(topics: readonly string[]): void {
    for (const topic of topics) this.observerOnlyTopics.add(topic);
  }

  async executeRequired(event: OutboxEventEnvelope): Promise<void> {
    const consumers = this.consumersByTopic.get(event.topic) ?? [];
    if (consumers.length === 0) {
      if (this.observerOnlyTopics.has(event.topic)) return;
      this.recordOutcome("unclassified", "none");
      throw new Error(`UNCLASSIFIED_DURABLE_EVENT:${event.topic}`);
    }

    const metadata: OutboxEventMetadata = {
      eventId: event.id,
      topic: event.topic,
      tenantId: event.tenantId,
    };
    for (const consumer of consumers) {
      let result: Awaited<ReturnType<OutboxConsumerRegistration["handle"]>>;
      try {
        result = await consumer.handle(event.payload, metadata);
      } catch (error) {
        this.recordOutcome("failed", consumer.id);
        throw new Error(`DURABLE_CONSUMER_THROWN:${consumer.id}`, { cause: error });
      }
      if (result.isErr()) {
        this.recordOutcome("failed", consumer.id);
        throw new Error(`DURABLE_CONSUMER_FAILED:${consumer.id}:${errorCode(result.error)}`);
      }
      this.recordOutcome("succeeded", consumer.id);
    }
  }

  private recordOutcome(outcome: string, consumer: string): void {
    this.metrics?.incrementCounter(
      "outbox_required_consumer_outcomes_total",
      "Required outbox consumer outcomes",
      1,
      { outcome, consumer },
    );
  }
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "type" in error) {
    return String(error.type);
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return "UNKNOWN";
}
