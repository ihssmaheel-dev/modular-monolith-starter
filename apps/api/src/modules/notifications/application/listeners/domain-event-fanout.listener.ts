import { Injectable } from "@nestjs/common";
import type { OutboxEventMetadata } from "@repo/contracts";
import { ok, err, type Result } from "neverthrow";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { SendNotificationCommand } from "../commands/send-notification.command";

/**
 * Translates domain events into notification types. Feature modules stay
 * untouched — to notify on a new event, add a handler here plus a registry
 * entry in @repo/contracts (NOTIFICATION_TYPES).
 */
@Injectable()
export class DomainEventFanoutListener {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly notify: SendNotificationCommand,
    private readonly getUserByEmail: GetUserByEmailQuery,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "DomainEventFanout" });
  }

  async onUserCreated(
    event: { userId: string; name: string },
    meta?: OutboxEventMetadata,
  ): Promise<Result<void, unknown>> {
    try {
      const result = await this.notify.execute({
        userId: event.userId,
        type: "user.welcome",
        titleKey: "notifications.types.userWelcome",
        titleParams: { name: event.name },
        sourceEvent: meta
          ? { id: meta.eventId, consumer: "notifications.user-welcome.v1" }
          : undefined,
      });
      if (result.isErr()) {
        this.logger.warn({ error: result.error }, "Welcome notification failed");
        return err(result.error);
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error({ error }, "Welcome fan-out failed");
      return err(error);
    }
  }

  async onInvitationCreated(
    event: {
      tenantId: string;
      organizationName: string;
      email: string;
      token: string;
    },
    meta?: OutboxEventMetadata,
  ): Promise<Result<void, unknown>> {
    try {
      const user = await this.getUserByEmail.execute(event.email);
      if (user.isErr() || !user.value) return ok(undefined);
      const result = await this.notify.execute({
        userId: user.value.id,
        tenantId: event.tenantId,
        type: "tenancy.invitation.received",
        titleKey: "notifications.types.invitationReceived",
        titleParams: { organization: event.organizationName },
        // Never persist the raw invite token: the email remains the accept
        // path, the inbox row links the tenant for context.
        data: { tenantId: event.tenantId },
        channels: ["inApp", "push"],
        sourceEvent: meta
          ? { id: meta.eventId, consumer: "notifications.invitation-received.v1" }
          : undefined,
      });
      if (result.isErr()) {
        this.logger.warn({ error: result.error }, "Invitation notification failed");
        return err(result.error);
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error({ error }, "Invitation fan-out failed");
      return err(error);
    }
  }

  async onExportReady(
    event: {
      requestId: string;
      userId: string;
    },
    meta?: OutboxEventMetadata,
  ): Promise<Result<void, unknown>> {
    try {
      const result = await this.notify.execute({
        userId: event.userId,
        type: "privacy.export.ready",
        titleKey: "notifications.types.exportReady",
        data: { requestId: event.requestId },
        sourceEvent: meta
          ? { id: meta.eventId, consumer: "notifications.export-ready.v1" }
          : undefined,
      });
      if (result.isErr()) {
        this.logger.warn({ error: result.error }, "Export-ready notification failed");
        return err(result.error);
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error({ error }, "Export-ready fan-out failed");
      return err(error);
    }
  }
}
