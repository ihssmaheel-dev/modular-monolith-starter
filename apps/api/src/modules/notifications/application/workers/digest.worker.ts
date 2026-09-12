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
import { DeviceTokensRepository } from "../../infrastructure/device-tokens.repository";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";
import { PreferencesRepository } from "../../infrastructure/preferences.repository";
import { PushDriverFactory } from "../../infrastructure/push/push.factory";
import { renderNotificationEmail } from "../commands/notification-email.renderer";

const DIGEST_BATCH_LIMIT = 100;

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
    private readonly preferences: PreferencesRepository,
    private readonly devices: DeviceTokensRepository,
    private readonly push: PushDriverFactory,
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
    const found = await this.batches.findById(batchId);
    if (found.isErr() || !found.value || found.value.items.length === 0) return false;
    const window = found.value;

    const duplicate = await this.notifications.findDigestByBatchId(batchId);
    if (duplicate.isOk() && duplicate.value) {
      await this.batches.updateOne({ id: batchId, status: "open" }, { status: "delivered" });
      return true;
    }

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
      data: { batchId: window.id, count: items.length, items },
      channels: enabled,
    });
    if (created.isErr()) return false;

    const claimed = await this.batches.updateOne(
      { id: batchId, status: "open" },
      { status: "delivered" },
    );
    if (claimed.isErr() || !claimed.value) {
      await this.notifications.deleteById(created.value.id);
      return true;
    }

    const translate = (key: string, params?: Record<string, unknown>) =>
      this.i18n.t(key, undefined, params as Record<string, string | number> | undefined);

    // Durable per-channel state, mirroring SendNotificationCommand: a crash
    // between channels must leave an observable record of what went out.
    const delivered: Array<"inApp" | "email" | "push"> = [];
    if (enabled.includes("inApp")) {
      try {
        this.realtime.sendToUser(
          window.userId,
          "notification.created",
          {
            id: created.value.id,
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
        const sent = await this.email.send({ to: user.value.email, subject, html });
        if (sent.isErr()) {
          this.logger.warn({ batchId: window.id }, "Digest email failed");
        } else {
          delivered.push("email");
        }
      }
    }
    if (enabled.includes("push")) {
      if (await this.deliverDigestPush(window.userId, items.length)) {
        delivered.push("push");
      }
    }
    if (delivered.length > 0) {
      const recorded = await this.notifications.updateById(created.value.id, {
        deliveredChannels: delivered,
      });
      if (recorded.isErr()) {
        this.logger.warn({ batchId: window.id }, "Digest channels not recorded");
      }
    }
    const event = new NotificationDigestReadyEvent(
      window.id,
      window.userId,
      window.type,
      items.length,
      window.tenantId ?? undefined,
    );
    const dispatched = window.tenantId
      ? await this.dispatchTenantScoped(window.tenantId, () =>
          this.outbox.dispatchTenant("notification.digest.ready", event),
        )
      : await this.outbox.dispatchGlobal("notification.digest.ready", event);
    if (dispatched.isErr()) {
      this.logger.warn({ batchId: window.id }, "Digest event dispatch failed");
      return false;
    }
    await this.emitMutated({
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

  private async deliverDigestPush(userId: string, count: number): Promise<boolean> {
    const tokens = await this.devices.findByUser(userId);
    if (tokens.isErr() || tokens.value.length === 0) return false;
    const driver = this.push.get();
    const expoTokens = tokens.value.filter((token) => token.provider === driver.provider);
    if (expoTokens.length === 0) return false;
    const title = this.i18n.t("notifications.digestTitle", undefined, { count });
    const results = await driver.send(
      expoTokens.map((token) => ({
        token: token.token,
        title,
        body: title,
        data: { count },
      })),
    );
    let delivered = false;
    for (const [index, result] of results.entries()) {
      const token = expoTokens[index];
      if (!token) continue;
      if (result?.status === "invalid-token") {
        await this.devices.deleteByUserAndToken(userId, token.token);
      } else if (result?.status === "failed") {
        this.logger.warn({ userId, reason: result.reason }, "Digest push failed");
      } else {
        delivered = true;
      }
    }
    return delivered;
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
