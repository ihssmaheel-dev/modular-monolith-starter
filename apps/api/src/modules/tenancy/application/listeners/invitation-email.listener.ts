import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { createHash } from "node:crypto";
import { OrganizationInvitationEmail, render } from "@repo/email";
import { buildFrontendUrl, FRONTEND_ROUTES, type EmailJobData } from "@repo/contracts";
import * as React from "react";
import { env } from "../../../../config/env";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { InvitationCreatedEvent } from "../../domain/events/invitation-created.event";

const EMAIL_RETRY_ATTEMPTS = 5;
const EMAIL_RETRY_DELAY_MS = 5_000;

@Injectable()
export class InvitationEmailListener {
  constructor(
    private readonly queue: QueueService,
    private readonly email: EmailService,
    private readonly i18n: I18nService,
    private readonly logger: PinoLoggerService,
  ) {}

  @OnEvent("tenancy.invitation.created")
  async handle(event: InvitationCreatedEvent): Promise<void> {
    const data = await this.buildEmail(event);
    const queue = this.queue.getQueue<EmailJobData>("email");
    if (queue) {
      try {
        await queue.add("organization-invitation", data, {
          jobId: `invitation-email:${invitationKey(event.token)}`,
          attempts: EMAIL_RETRY_ATTEMPTS,
          backoff: { type: "exponential", delay: EMAIL_RETRY_DELAY_MS },
          removeOnComplete: 100,
          removeOnFail: 1000,
        });
        return;
      } catch (error) {
        this.logger.error({ error, tenantId: event.tenantId }, "Invitation queueing failed");
      }
    }
    const result = await this.email.send(data);
    if (result.isErr()) {
      this.logger.error(
        { code: result.error.code, tenantId: event.tenantId },
        "Invitation email failed",
      );
    }
  }

  private async buildEmail(event: InvitationCreatedEvent): Promise<EmailJobData> {
    const params = { organization: event.organizationName };
    const translate = (key: string) => this.i18n.t(key, event.locale, params);
    const html = await render(
      React.createElement(OrganizationInvitationEmail, {
        acceptUrl: buildFrontendUrl(env.CLIENT_URL, FRONTEND_ROUTES.acceptInvitation, {
          token: event.token,
        }),
        preview: translate("email.invitation.preview"),
        heading: translate("email.invitation.heading"),
        body: translate("email.invitation.body"),
        buttonText: translate("email.invitation.buttonText"),
      }),
    );
    return { to: event.email, subject: translate("email.invitation.subject"), html };
  }
}

function invitationKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}
