import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
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

  @OnEvent("user.created")
  async onUserCreated(event: { userId: string; name: string }): Promise<void> {
    try {
      const result = await this.notify.execute({
        userId: event.userId,
        type: "user.welcome",
        titleKey: "notifications.types.userWelcome",
        titleParams: { name: event.name },
      });
      if (result.isErr()) {
        this.logger.warn({ error: result.error }, "Welcome notification failed");
      }
    } catch (error) {
      this.logger.error({ error }, "Welcome fan-out failed");
    }
  }

  @OnEvent("tenancy.invitation.created")
  async onInvitationCreated(event: {
    tenantId: string;
    organizationName: string;
    email: string;
    token: string;
  }): Promise<void> {
    try {
      const user = await this.getUserByEmail.execute(event.email);
      if (user.isErr() || !user.value) return;
      const result = await this.notify.execute({
        userId: user.value.id,
        tenantId: event.tenantId,
        type: "tenancy.invitation.received",
        titleKey: "notifications.types.invitationReceived",
        titleParams: { organization: event.organizationName },
        data: { tenantId: event.tenantId, token: event.token },
        channels: ["inApp", "push"],
      });
      if (result.isErr()) {
        this.logger.warn({ error: result.error }, "Invitation notification failed");
      }
    } catch (error) {
      this.logger.error({ error }, "Invitation fan-out failed");
    }
  }

  @OnEvent("privacy.export.ready")
  async onExportReady(event: { requestId: string; userId: string }): Promise<void> {
    try {
      const result = await this.notify.execute({
        userId: event.userId,
        type: "privacy.export.ready",
        titleKey: "notifications.types.exportReady",
        data: { requestId: event.requestId },
      });
      if (result.isErr()) {
        this.logger.warn({ error: result.error }, "Export-ready notification failed");
      }
    } catch (error) {
      this.logger.error({ error }, "Export-ready fan-out failed");
    }
  }
}
