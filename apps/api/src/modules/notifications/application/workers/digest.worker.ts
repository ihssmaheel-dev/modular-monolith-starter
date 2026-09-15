import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { getNotificationType } from "@repo/contracts";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { RealtimeService } from "../../../../infrastructure/realtime/realtime.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { NotificationDigestReadyEvent } from "../../domain/events/notification.events";
import { BatchesRepository } from "../../infrastructure/repositories/batches.repository";
import { NotificationsRepository } from "../../infrastructure/repositories/notifications.repository";
import { PreferencesRepository } from "../../infrastructure/repositories/preferences.repository";
import { DeliveryIntentsRepository } from "../../infrastructure/repositories/delivery-intents.repository";

const DIGEST_BATCH_LIMIT = 100;

interface PreparedDigest {
  window: {
    id: string;
    userId: string;
    tenantId?: string | null;
    type: string;
  };
  items: Array<{
    titleKey: string;
    titleParams?: Record<string, unknown>;
    data?: Record<string, unknown>;
  }>;
  enabled: Array<"inApp" | "email" | "push">;
  notificationId: string;
}

/**
 * Closes expired batch-on-write windows and delivers one digest per window:
 * a single center row, one email (tiered rendering), one count-only push.
 * Exactly-once visibility: work happens first, then an atomic open→delivered
 * claim; a replica that loses the claim deletes its duplicate row. A crash
 * anywhere before the claim simply retries the open window next tick.
 */
@Injectable()
export class DigestWorker {
  private isRunning = false;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly batches: BatchesRepository,
    private readonly notifications: NotificationsRepository,
    private readonly deliveryIntents: DeliveryIntentsRepository,
    private readonly preferences: PreferencesRepository,
    private readonly realtime: RealtimeService,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    private readonly tenantContext: TenantContextService,
    private readonly database: DatabaseService,
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "DigestWorker" });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async closeDueWindows(): Promise<{ delivered: number }> {
    if (env.PROCESS_ROLE === "api" || this.isRunning) return { delivered: 0 };
    this.isRunning = true;
    let delivered = 0;
    try {
      // Open the transaction inside the system CLS scope so SQL settings
      // (app.system_scope) are established from matching context. Reading
      // through the pool handle without a transaction would run outside any
      // scope and return no rows under enforced RLS.
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
        const due = await this.database.runTransaction(async () =>
          this.batches.findDueWindows(DIGEST_BATCH_LIMIT),
        );
        for (const window of due) {
          try {
            if (await this.deliverWindow(window.id)) delivered += 1;
          } catch (error) {
            this.logger.error({ error, batchId: window.id }, "Digest delivery failed");
          }
        }
      });
      if (delivered > 0) {
        this.metrics.incrementCounter(
          "notifications_digest_delivered_total",
          "Digests delivered",
          delivered,
        );
        this.logger.info({ delivered }, "Digest run completed");
      }
    } catch (error) {
      this.logger.error({ error }, "Digest run failed");
    } finally {
      this.isRunning = false;
    }
    return { delivered };
  }

  private async deliverWindow(batchId: string): Promise<boolean> {
    const prepared = await this.database.runTransaction(() => this.prepareWindow(batchId));
    if (prepared === "complete") return true;
    if (!prepared) return false;
    const { window, items, enabled, notificationId } = prepared;

    const delivered: Array<"inApp" | "email" | "push"> = [];
    if (enabled.includes("inApp")) {
      try {
        this.realtime.sendToUser(
          window.userId,
          "notification.created",
          {
            id: notificationId,
            type: window.type,
            titleKey: "notifications.digestTitle",
            titleParams: { count: items.length },
          },
          window.tenantId ?? undefined,
        );
        delivered.push("inApp");
      } catch (error) {
        this.logger.warn({ error, batchId: window.id }, "Digest realtime failed");
      }
    }
    if (delivered.length > 0) {
      const recorded = await this.database.withResultTransaction(() =>
        this.notifications.updateById(notificationId, { deliveredChannels: delivered }),
      );
      if (recorded.isErr())
        this.logger.warn({ batchId: window.id }, "Digest channels not recorded");
    }
    return this.dispatchReadyEvent(prepared);
  }

  private async prepareWindow(batchId: string): Promise<PreparedDigest | "complete" | null> {
    const found = await this.batches.findById(batchId);
    if (found.isErr() || !found.value || found.value.items.length === 0) return null;
    const window = found.value;

    const duplicate = await this.notifications.findDigestByBatchId(batchId);
    if (duplicate.isOk() && duplicate.value) {
      await this.batches.updateOne({ id: batchId, status: "open" }, { status: "delivered" });
      return "complete";
    }

    const definition = getNotificationType(window.type);
    if (!definition) return null;

    const prefs = await this.preferences.findByUser(window.userId);
    const row = prefs.isOk()
      ? prefs.value.find((p) => p.category === definition.category)
      : undefined;
    const enabled = definition.defaultChannels.filter(
      (channel) => row?.toJSON()[channel] !== false,
    );
    if (enabled.length === 0) return null;

    const items = window.items.map((item) => ({
      titleKey: item.titleKey,
      titleParams: item.titleParams,
      data: item.data,
    }));
    const created = await this.notifications.create({
      userId: window.userId,
      tenantId: window.tenantId ?? undefined,
      type: window.type,
      category: definition.category,
      titleKey: "notifications.digestTitle",
      titleParams: { count: items.length },
      data: { batchId: window.id, count: items.length, items },
      channels: enabled,
    });
    if (created.isErr()) return null;
    await this.deliveryIntents.createForNotification(
      created.value.id,
      window.userId,
      window.tenantId ?? undefined,
      enabled,
    );

    const claimed = await this.batches.updateOne(
      { id: batchId, status: "open" },
      { status: "delivered" },
    );
    if (claimed.isErr() || !claimed.value) {
      await this.notifications.deleteById(created.value.id);
      return "complete";
    }
    return { window, items, enabled, notificationId: created.value.id };
  }

  private async dispatchReadyEvent(prepared: PreparedDigest): Promise<boolean> {
    const { window, items, notificationId } = prepared;
    const event = new NotificationDigestReadyEvent(
      window.id,
      window.userId,
      window.type,
      items.length,
      window.tenantId ?? undefined,
    );
    const dispatch = () =>
      window.tenantId
        ? this.dispatchTenantScoped(window.tenantId, () =>
            this.outbox.dispatchTenant("notification.digest.ready", event),
          )
        : this.outbox.dispatchGlobal("notification.digest.ready", event);
    const dispatched = await this.database.withResultTransaction(async () => {
      const result = await dispatch();
      if (result.isErr()) return result;
      await this.emitMutated({
        collectionName: "notifications",
        documentId: notificationId,
        action: "CREATE",
        actorId: undefined,
        tenantId: window.tenantId ?? undefined,
        before: null,
        after: { id: notificationId, type: window.type, digest: true },
      });
      return result;
    });
    if (dispatched.isErr()) {
      this.logger.warn({ batchId: window.id }, "Digest event dispatch failed");
      return false;
    }
    return true;
  }

  private async dispatchTenantScoped<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    if (this.tenantContext) {
      return this.tenantContext.run({ mode: "multi", tenantId }, fn);
    }
    return fn();
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    await this.database.emitAfterCommit(this.events, "database.mutated", payload);
  }
}
