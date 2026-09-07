import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { getNotificationType } from "@repo/contracts";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { RealtimeService } from "../../../../infrastructure/realtime/realtime.service";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { NotificationDigestReadyEvent } from "../../domain/events/notification.events";
import { BatchesRepository } from "../../infrastructure/batches.repository";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";
import { PreferencesRepository } from "../../infrastructure/preferences.repository";
import { renderNotificationEmail } from "../commands/notification-email.renderer";

const DIGEST_BATCH_LIMIT = 100;

/**
 * Closes expired batch-on-write windows and delivers one digest per window:
 * a single center row, one email (tiered rendering), one count-only push.
 * Windows are claimed with an atomic status transition so concurrent
 * worker replicas never double-deliver.
 */
@Injectable()
export class DigestWorker {
  private isRunning = false;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly batches: BatchesRepository,
    private readonly notifications: NotificationsRepository,
    private readonly preferences: PreferencesRepository,
    private readonly getUserById: GetUserByIdQuery,
    private readonly realtime: RealtimeService,
    private readonly email: EmailService,
    private readonly i18n: I18nService,
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
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
        const due = await this.batches.findDueWindows(DIGEST_BATCH_LIMIT);
        for (const window of due) {
          const claimed = await this.database.runTransaction(() =>
            this.batches.updateOne({ id: window.id, status: "open" }, { status: "delivered" }),
          );
          if (claimed.isErr() || !claimed.value) continue;
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
    const found = await this.batches.findById(batchId);
    if (found.isErr() || !found.value || found.value.items.length === 0) return false;
    const window = found.value;
    const definition = getNotificationType(window.type);
    if (!definition) return false;

    const prefs = await this.preferences.findByUser(window.userId);
    const row = prefs.isOk()
      ? prefs.value.find((p) => p.category === definition.category)
      : undefined;
    const enabled = definition.defaultChannels.filter(
      (channel) => row?.toJSON()[channel] !== false,
    );
    if (enabled.length === 0) return false;

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
      data: { count: items.length, items },
      channels: enabled,
    });
    if (created.isErr()) return false;

    const translate = (key: string, params?: Record<string, unknown>) =>
      this.i18n.t(key, undefined, params as Record<string, string | number> | undefined);

    if (enabled.includes("inApp")) {
      this.realtime.sendToUser(
        window.userId,
        "notification.created",
        { id: created.value.id, type: window.type, titleKey: "notifications.digestTitle" },
        window.tenantId ?? undefined,
      );
    }
    if (enabled.includes("email")) {
      const user = await this.getUserById.execute(window.userId);
      if (user.isOk() && user.value) {
        const subject = translate("notifications.digestTitle", { count: items.length });
        const html = await renderNotificationEmail({
          subject,
          items,
          count: items.length,
          translate,
        });
        await this.email.send({ to: user.value.email, subject, html });
      }
    }
    const dispatched = window.tenantId
      ? await this.outbox.dispatchTenant(
          "notification.digest.ready",
          new NotificationDigestReadyEvent(window.id, window.userId, window.type, items.length),
        )
      : await this.outbox.dispatchGlobal(
          "notification.digest.ready",
          new NotificationDigestReadyEvent(window.id, window.userId, window.type, items.length),
        );
    if (dispatched.isErr()) {
      this.logger.warn({ batchId: window.id }, "Digest event dispatch failed");
      return false;
    }
    await this.events.emitAsync("database.mutated", {
      collectionName: "notifications",
      documentId: created.value.id,
      action: "CREATE",
      actorId: undefined,
      tenantId: window.tenantId ?? undefined,
      before: null,
      after: { id: created.value.id, type: window.type, digest: true },
    });
    return true;
  }
}
