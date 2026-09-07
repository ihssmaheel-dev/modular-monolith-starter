import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MetricsService } from "../metrics/metrics.service";
import { PinoLoggerService } from "../logger/logger.service";
import { DatabaseService, TenantContextService } from "../database";
import { env } from "../../config/env";
import { OutboxEvent, OutboxRepository } from "./outbox.repository";
import { OutboxRelayDelivery } from "./outbox-relay.delivery";

const BATCH_SIZE = 10;
const LOCK_TIMEOUT_MS = 60_000;
const PUBLISHED_RETENTION_DAYS = 30;
const RETENTION_BATCH_SIZE = 1000;

@Injectable()
export class OutboxRelayWorker {
  private isProcessing = false;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly metrics: MetricsService,
    private readonly tenantContext: TenantContextService,
    private readonly database: DatabaseService,
    private readonly delivery: OutboxRelayDelivery,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "OutboxRelayWorker" });
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async relayEvents(): Promise<void> {
    if (env.PROCESS_ROLE === "api" || this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
        await this.recoverStaleLocks();
        const events = await this.getPendingEvents();
        for (const event of events) await this.relayEvent(event);
        await this.retainPublishedEvents();
      });
    } catch (error) {
      this.logger.error({ err: error }, "Outbox relay failed");
    } finally {
      this.isProcessing = false;
    }
  }

  private async getPendingEvents(): Promise<OutboxEvent[]> {
    return this.database.runTransaction(async () => {
      const pendingCount = await this.repository.countPendingEvents();
      this.metrics.setGauge("outbox_pending_events_depth", "Pending outbox events", pendingCount);
      const events = await this.repository.lockPendingEvents(BATCH_SIZE);
      const oldest = events[0];
      this.metrics.setGauge(
        "outbox_pending_age_ms",
        "Age of oldest claimed outbox event",
        oldest ? eventAgeMs(oldest.createdAt) : 0,
      );
      return events;
    });
  }

  private async relayEvent(event: OutboxEvent): Promise<void> {
    await this.tenantContext.runSystem({ mode: env.TENANCY_MODE, tenantId: event.tenantId }, () =>
      this.delivery.deliver(event),
    );
  }

  private async recoverStaleLocks(): Promise<void> {
    const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS);
    const recovered = await this.database.runTransaction(() =>
      this.repository.recoverStaleLocks(cutoff),
    );
    if (recovered > 0) this.logger.warn({ recovered }, "Recovered stale outbox locks");
  }

  private async retainPublishedEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - PUBLISHED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const pruned = await this.database.runTransaction(() =>
      this.repository.deletePublishedBefore(cutoff, RETENTION_BATCH_SIZE),
    );
    if (pruned > 0) this.logger.info({ pruned }, "Pruned published outbox events");
  }
}

function eventAgeMs(createdAt: Date | undefined): number {
  if (!(createdAt instanceof Date)) return 0;
  const timestamp = createdAt.getTime();
  return Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : 0;
}
