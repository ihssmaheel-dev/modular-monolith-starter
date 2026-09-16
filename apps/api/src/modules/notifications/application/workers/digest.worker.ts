import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { getNotificationType } from "@repo/contracts";
import { err, ok, type Result } from "neverthrow";
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

type DigestPreparationError = { type: "DIGEST_PREPARATION_FAILED" };

/**
 * Closes expired batch-on-write windows and delivers one digest per window:
 * a single center row, one email (tiered rendering), one count-only push.
 * A row lock lets one replica prepare a window. Notification, delivery
 * intents, delivered state, audit callback, and outbox record share one
 * transaction; rollback leaves the open window eligible for the next tick.
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
    const run = async () => {
      this.isRunning = true;
      let delivered = 0;
      try {
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
    };

    if (typeof this.database.withExclusiveExecution === "function") {
      const lockResult = await this.database.withExclusiveExecution(
        "worker:notifications-digest",
        run,
      );
      if (!lockResult.executed) return { delivered: 0 };
      return lockResult.result ?? { delivered: 0 };
    }

    return run();
  }

  private async deliverWindow(batchId: string): Promise<boolean> {
    const result = await this.database.withResultTransaction(() => this.prepareWindow(batchId));
    if (result.isErr()) {
      this.logger.warn({ batchId }, "Digest preparation transaction failed");
      return false;
    }
    const prepared = result.value;
    if (prepared === "closed") return false;
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
    return true;
  }

  private async prepareWindow(
    batchId: string,
  ): Promise<Result<PreparedDigest | "closed" | null, DigestPreparationError>> {
    const window = await this.batches.lockDueWindow(batchId);
    if (!window) return ok(null);
    if (window.items.length === 0) return this.closeWithoutDelivery(batchId);

    const duplicate = await this.notifications.findDigestByBatchId(batchId);
    if (duplicate.isOk() && duplicate.value) {
      return this.closeWithoutDelivery(batchId);
    }
    if (duplicate.isErr()) return err({ type: "DIGEST_PREPARATION_FAILED" });

    const definition = getNotificationType(window.type);
    if (!definition) return this.closeWithoutDelivery(batchId);

    const prefs = await this.preferences.findByUser(window.userId);
    const row = prefs.isOk()
      ? prefs.value.find((p) => p.category === definition.category)
      : undefined;
    const enabled = definition.defaultChannels.filter(
      (channel) => row?.toJSON()[channel] !== false,
    );
    if (enabled.length === 0) return this.closeWithoutDelivery(batchId);

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
    if (created.isErr()) return err({ type: "DIGEST_PREPARATION_FAILED" });
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
    if (claimed.isErr() || !claimed.value) return err({ type: "DIGEST_PREPARATION_FAILED" });
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
    const dispatched = await dispatch();
    if (dispatched.isErr()) return err({ type: "DIGEST_PREPARATION_FAILED" });
    await this.emitMutated({
      collectionName: "notifications",
      documentId: created.value.id,
      action: "CREATE",
      actorId: undefined,
      tenantId: window.tenantId ?? undefined,
      before: null,
      after: { id: created.value.id, type: window.type, digest: true },
    });
    return ok({ window, items, enabled, notificationId: created.value.id });
  }

  private async closeWithoutDelivery(
    batchId: string,
  ): Promise<Result<"closed", DigestPreparationError>> {
    const closed = await this.batches.updateOne(
      { id: batchId, status: "open" },
      { status: "delivered" },
    );
    return closed.isOk() && closed.value
      ? ok("closed")
      : err({ type: "DIGEST_PREPARATION_FAILED" });
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
