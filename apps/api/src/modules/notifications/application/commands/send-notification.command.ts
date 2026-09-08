import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import { getNotificationType, type DigestCadence, type NotificationChannel } from "@repo/contracts";
import { env } from "../../../../config/env";
import {
  DatabaseService,
  TenantContextService,
  type TransactionError,
} from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { RealtimeService } from "../../../../infrastructure/realtime/realtime.service";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { Notification } from "../../domain/entities/notification.entity";
import {
  defaultPreferencesForUser,
  type NotificationPreferenceData,
} from "../../domain/entities/notification-preference.entity";
import type { NotificationError } from "../../domain/errors/notification.errors";
import { NotificationCreatedEvent } from "../../domain/events/notification.events";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";
import { PreferencesRepository } from "../../infrastructure/preferences.repository";
import { DeviceTokensRepository } from "../../infrastructure/device-tokens.repository";
import { BatchesRepository } from "../../infrastructure/batches.repository";
import { PushDriverFactory } from "../../infrastructure/push/push.factory";
import { renderNotificationEmail } from "./notification-email.renderer";

export interface SendNotificationInput {
  userId: string;
  tenantId?: string;
  type: string;
  titleKey: string;
  titleParams?: Record<string, unknown>;
  data?: Record<string, unknown> & { entityId?: string };
  /** Overrides the type's default channels (e.g. email already sent elsewhere). */
  channels?: NotificationChannel[];
}

const CADENCE_WINDOW_MINUTES: Record<DigestCadence, number> = {
  realtime: 0,
  hourly: 60,
  daily: 1440,
};

/**
 * THE single entry point for notifications. Features dispatch domain events;
 * fan-out listeners translate them into this command. Never send email, push,
 * or realtime messages from feature modules directly.
 */
@Injectable()
export class SendNotificationCommand {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly preferences: PreferencesRepository,
    private readonly devices: DeviceTokensRepository,
    private readonly batches: BatchesRepository,
    private readonly getUserById: GetUserByIdQuery,
    private readonly realtime: RealtimeService,
    private readonly email: EmailService,
    private readonly push: PushDriverFactory,
    private readonly i18n: I18nService,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    logger: PinoLoggerService,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly cache?: DistributedCacheService,
  ) {
    this.logger = logger.child({ module: "SendNotificationCommand" });
  }

  async execute(
    input: SendNotificationInput,
  ): Promise<Result<Notification, NotificationError | TransactionError>> {
    const operation = () => this.persist(input);
    const result = this.database ? await this.database.withResultTransaction(operation) : await operation();
    if (result.isErr()) return err(result.error);
    // Channel delivery runs after commit: providers are slow, lossy, and must
    // never roll back the persisted row. deliver() catches per channel.
    await this.deliver(result.value.notification, result.value.wanted, input.tenantId);
    return ok(result.value.notification);
  }

  private async persist(
    input: SendNotificationInput,
  ): Promise<
    Result<{ notification: Notification; wanted: NotificationChannel[] }, NotificationError | TransactionError>
  > {
    const definition = getNotificationType(input.type);
    if (!definition) return err({ type: "UNKNOWN_NOTIFICATION_TYPE", key: input.type });

    const recipient = await this.getUserById.execute(input.userId);
    if (recipient.isErr() || !recipient.value) return err({ type: "NOTIFICATION_SEND_FAILED" });

    const prefs = await this.ensurePreferences(input.userId);
    const preference = prefs.find((p) => p.category === definition.category);
    const wanted = (input.channels ?? definition.defaultChannels).filter(
      (channel) => preference?.[channel] !== false,
    );
    if (wanted.length === 0) return err({ type: "NOTIFICATION_SEND_FAILED" });

    // Window is the type's batching horizon capped by the user's cadence:
    // a daily cadence never closes faster than the type allows, an hourly
    // cadence never waits longer than an hour.
    const cadence = preference?.digestCadence ?? definition.defaultCadence;
    const windowMinutes = Math.min(
      definition.digestWindowMinutes,
      CADENCE_WINDOW_MINUTES[cadence] || 0,
    );
    if (!definition.critical && cadence !== "realtime" && windowMinutes > 0) {
      const batched = await this.appendToBatch(input, definition.grouping, windowMinutes);
      if (batched.isErr()) return err(batched.error);
      const row = await this.createRow(input, definition.category, wanted, true);
      if (row.isErr()) return err(row.error);
      return ok({ notification: row.value, wanted });
    }
    const created = await this.createRow(input, definition.category, wanted, false);
    if (created.isErr()) return err(created.error);
    return ok({ notification: created.value, wanted });
  }

  private async ensurePreferences(userId: string): Promise<NotificationPreferenceData[]> {
    const existing = await this.preferences.findByUser(userId);
    if (existing.isOk() && existing.value.length > 0) {
      return existing.value.map((p) => p.toJSON());
    }
    const defaults = defaultPreferencesForUser(userId);
    await this.preferences.upsertDefaults(defaults);
    return defaults;
  }

  private async createRow(
    input: SendNotificationInput,
    category: string,
    channels: NotificationChannel[],
    batched: boolean,
  ): Promise<Result<Notification, NotificationError>> {
    const created = await this.notifications.create({
      userId: input.userId,
      tenantId: input.tenantId,
      type: input.type,
      category,
      titleKey: input.titleKey,
      titleParams: input.titleParams,
      data: input.data,
      channels,
    });
    if (created.isErr()) return err({ type: "NOTIFICATION_SEND_FAILED" });
    await this.emitMutated({
      collectionName: "notifications",
      documentId: created.value.id,
      action: "CREATE",
      actorId: undefined,
      tenantId: input.tenantId,
      before: null,
      after: { id: created.value.id, type: input.type },
    });
    if (!batched) {
      const event = new NotificationCreatedEvent(
        created.value.id,
        input.userId,
        input.type,
        input.tenantId,
      );
      const dispatched = input.tenantId
        ? await this.dispatchTenantScoped(input.tenantId, () =>
            this.outbox.dispatchTenant("notification.created", event),
          )
        : await this.outbox.dispatchGlobal("notification.created", event);
      if (dispatched.isErr()) return err({ type: "NOTIFICATION_DISPATCH_FAILED" });
    }
    return ok(created.value);
  }

  private async dispatchTenantScoped<T>(
    tenantId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (this.tenantContext) {
      return this.tenantContext.run({ mode: "multi", tenantId }, fn);
    }
    return fn();
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.events, "database.mutated", payload);
      return;
    }
    await this.events.emitAsync("database.mutated", payload);
  }

  private async appendToBatch(
    input: SendNotificationInput,
    grouping: "entity" | "none",
    windowMinutes: number,
  ): Promise<Result<void, TransactionError>> {
    const entityId =
      grouping === "entity" && typeof input.data?.entityId === "string"
        ? input.data.entityId
        : "none";
    const groupingKey = `${input.userId}:${input.type}:${entityId}`;
    const existing = await this.batches.findOpenWindow(input.userId, groupingKey);
    const item = { titleKey: input.titleKey, titleParams: input.titleParams, data: input.data };
    if (existing.isOk() && existing.value) {
      await this.batches.appendToWindow(existing.value.id, item, env.NOTIFICATION_DIGEST_MAX_ITEMS);
      return ok(undefined);
    }
    try {
      await this.batches.create({
        userId: input.userId,
        tenantId: input.tenantId,
        type: input.type,
        groupingKey,
        items: [item],
        status: "open",
        windowEndsAt: new Date(Date.now() + windowMinutes * 60 * 1000),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) return err({ type: "TRANSACTION_FAILED" });
      const reopened = await this.batches.findOpenWindow(input.userId, groupingKey);
      if (reopened.isOk() && reopened.value) {
        await this.batches.appendToWindow(
          reopened.value.id,
          item,
          env.NOTIFICATION_DIGEST_MAX_ITEMS,
        );
        return ok(undefined);
      }
      return err({ type: "TRANSACTION_FAILED" });
    }
    return ok(undefined);
  }

  private async deliver(
    notification: Notification,
    channels: NotificationChannel[],
    tenantId?: string,
  ): Promise<void> {
    const data = notification.toJSON();
    try {
      await this.cache?.invalidateGlobal(`notifications:unread:${data.userId}`);
    } catch (error) {
      this.logger.error({ error, userId: data.userId }, "Unread cache invalidation failed");
    }
    const payload = {
      id: data.id,
      type: data.type,
      titleKey: data.titleKey,
      titleParams: data.titleParams,
      data: data.data,
    };
    for (const channel of channels) {
      try {
        if (channel === "inApp") {
          this.realtime.sendToUser(data.userId, "notification.created", payload, tenantId);
        } else if (channel === "email") {
          await this.deliverEmail(data.userId, data.titleKey, data.titleParams ?? undefined);
        } else if (channel === "push") {
          await this.deliverPush(data.userId, data.titleKey, data.titleParams ?? undefined, tenantId);
        }
      } catch (error) {
        this.logger.error({ error, channel, notificationId: data.id }, "Channel delivery failed");
      }
    }
  }

  private async deliverEmail(
    userId: string,
    titleKey: string,
    titleParams?: Record<string, unknown>,
  ): Promise<void> {
    const user = await this.getUserById.execute(userId);
    if (user.isErr() || !user.value) return;
    const translate = (key: string, params?: Record<string, unknown>) =>
      this.i18n.t(key, undefined, params as Record<string, string | number> | undefined);
    const subject = translate(titleKey, titleParams);
    const html = await renderNotificationEmail({
      subject,
      items: [{ titleKey, titleParams }],
      count: 1,
      translate,
    });
    const result = await this.email.send({ to: user.value.email, subject, html });
    if (result.isErr()) {
      this.logger.warn({ userId }, "Notification email failed");
    }
  }

  private async deliverPush(
    userId: string,
    titleKey: string,
    titleParams: Record<string, unknown> | undefined,
    tenantId?: string,
  ): Promise<void> {
    const tokens = await this.devices.findByUser(userId);
    if (tokens.isErr() || tokens.value.length === 0) return;
    const driver = this.push.get();
    const expoTokens = tokens.value.filter((token) => token.provider === driver.provider);
    if (expoTokens.length === 0) return;
    const title = this.i18n.t(
      titleKey,
      undefined,
      titleParams as Record<string, string | number> | undefined,
    );
    const results = await driver.send(
      expoTokens.map((token) => ({
        token: token.token,
        title,
        body: title,
        data: { userId, tenantId },
      })),
    );
    const dead = expoTokens.filter((_, index) => results[index]?.status === "invalid-token");
    for (const token of dead) {
      await this.devices.deleteByUserAndToken(userId, token.token);
    }
    for (const result of results) {
      if (result?.status === "failed") {
        this.logger.warn({ userId, reason: result.reason }, "Notification push failed");
      }
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}
