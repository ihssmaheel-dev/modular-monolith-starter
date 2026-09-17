import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { DeviceTokensRepository } from "../../infrastructure/repositories/device-tokens.repository";
import {
  DeliveryIntentsRepository,
  type NotificationDeliveryIntent,
} from "../../infrastructure/repositories/delivery-intents.repository";
import { PushDriverFactory } from "../../infrastructure/push/push.factory";
import { renderNotificationEmail } from "../commands/notification-email.renderer";

const DELIVERY_BATCH_SIZE = 50;
const DELIVERY_MAX_ATTEMPTS = 5;

@Injectable()
export class NotificationDeliveryWorker {
  private running = false;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly intents: DeliveryIntentsRepository,
    private readonly devices: DeviceTokensRepository,
    private readonly push: PushDriverFactory,
    private readonly users: GetUserByIdQuery,
    private readonly email: EmailService,
    private readonly i18n: I18nService,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "NotificationDeliveryWorker" });
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async deliverPending(): Promise<void> {
    if (env.PROCESS_ROLE === "api" || this.running) return;
    this.running = true;
    try {
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
        const intents = await this.claimAndMeasureBacklog();
        for (const intent of intents) await this.deliverOne(intent);
      });
    } catch (error) {
      this.logger.error({ error }, "Notification delivery run failed");
    } finally {
      this.running = false;
    }
  }

  private lastBacklogCheck = 0;

  private async claimAndMeasureBacklog(): Promise<NotificationDeliveryIntent[]> {
    return this.database.runTransaction(async () => {
      if (Date.now() - this.lastBacklogCheck >= 60_000) {
        const stats = await this.intents.getBacklogStats();
        this.metrics.setGauge(
          "notification_delivery_pending_depth",
          "Pending notification delivery intents",
          stats.pending,
        );
        this.metrics.setGauge(
          "notification_delivery_dead_depth",
          "Dead notification delivery intents",
          stats.dead,
        );
        const age = stats.oldestPendingAt ? Date.now() - stats.oldestPendingAt.getTime() : 0;
        this.metrics.setGauge(
          "notification_delivery_oldest_pending_age_seconds",
          "Age of the oldest pending notification delivery intent",
          Math.max(0, age / 1000),
        );
        this.lastBacklogCheck = Date.now();
      }
      return this.intents.claimBatch(DELIVERY_BATCH_SIZE);
    });
  }

  private async deliverOne(intent: NotificationDeliveryIntent): Promise<void> {
    try {
      const notification = await this.database.runTransaction(() =>
        this.intents.findNotification(intent),
      );
      if (!notification) return this.recordFailure(intent, "notification missing");
      const delivered =
        intent.channel === "email"
          ? await this.deliverEmail(intent, notification)
          : await this.deliverPush(intent, notification);
      if (!delivered) return this.recordFailure(intent, "provider delivery failed");
      await this.database.runTransaction(() => this.intents.markDelivered(intent));
      this.metrics.incrementCounter(
        "notification_delivery_total",
        "Notification channel deliveries",
        1,
        { channel: intent.channel, outcome: "delivered" },
      );
    } catch (error) {
      await this.recordFailure(intent, String(error));
    }
  }

  private async recordFailure(intent: NotificationDeliveryIntent, error: string): Promise<void> {
    await this.database.runTransaction(() =>
      this.intents.markFailed(intent, error, DELIVERY_MAX_ATTEMPTS),
    );
    this.metrics.incrementCounter(
      "notification_delivery_total",
      "Notification channel deliveries",
      1,
      {
        channel: intent.channel,
        outcome: intent.attempts >= DELIVERY_MAX_ATTEMPTS ? "dead" : "retry",
      },
    );
  }

  private async deliverEmail(
    intent: NotificationDeliveryIntent,
    notification: { titleKey: string; titleParams: unknown },
  ): Promise<boolean> {
    const user = await this.database.runTransaction(() => this.users.execute(intent.userId));
    if (user.isErr() || !user.value) return false;
    const params = asParams(notification.titleParams);
    const subject = this.translate(notification.titleKey, params);
    const html = await renderNotificationEmail({
      subject,
      items: [{ titleKey: notification.titleKey, titleParams: params }],
      count: 1,
      translate: (key, values) => this.translate(key, values),
    });
    const result = await this.email.send({
      to: user.value.email,
      subject,
      html,
      operationId: intent.id,
    });
    return result.isOk();
  }

  private async deliverPush(
    intent: NotificationDeliveryIntent,
    notification: { titleKey: string; titleParams: unknown },
  ): Promise<boolean> {
    const tokens = await this.database.runTransaction(() => this.devices.findByUser(intent.userId));
    if (tokens.isErr()) return false;
    const driver = this.push.get();
    const matching = tokens.value.filter((token) => token.provider === driver.provider);
    if (matching.length === 0) return false;
    const title = this.translate(notification.titleKey, asParams(notification.titleParams));
    const results = await driver.send(
      matching.map((token) => ({
        token: token.token,
        title,
        body: title,
        data: { notificationId: intent.notificationId, tenantId: intent.tenantId },
      })),
    );
    await this.removeInvalidTokens(intent.userId, matching, results);
    return results.some((result) => result.status === "sent");
  }

  private async removeInvalidTokens(
    userId: string,
    tokens: Array<{ token: string }>,
    results: Array<{ status: string }>,
  ): Promise<void> {
    for (const [index, result] of results.entries()) {
      const token = tokens[index];
      if (result.status !== "invalid-token" || !token) continue;
      await this.database.runTransaction(() =>
        this.devices.deleteByUserAndToken(userId, token.token),
      );
    }
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    return this.i18n.t(key, undefined, params as Record<string, string | number> | undefined);
  }
}

function asParams(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
