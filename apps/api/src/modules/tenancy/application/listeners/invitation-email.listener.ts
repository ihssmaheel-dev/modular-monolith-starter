import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { OrganizationInvitationEmail, render } from "@repo/email";
import {
  buildFrontendUrl,
  FRONTEND_ROUTES,
  type EmailJobData,
  type OutboxEventMetadata,
} from "@repo/contracts";
import * as React from "react";
import { env } from "../../../../config/env";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { InvitationCreatedEvent } from "../../domain/events/tenancy.events";
import { err, ok, type Result } from "neverthrow";

const EMAIL_RETRY_ATTEMPTS = 5;
const EMAIL_RETRY_DELAY_MS = 5_000;
const EMAIL_JOB_RETENTION_SECONDS = 8 * 24 * 60 * 60;

@Injectable()
export class InvitationEmailListener {
  constructor(
    private readonly queue: QueueService,
    private readonly i18n: I18nService,
    private readonly logger: PinoLoggerService,
  ) {}

  async handle(
    event: InvitationCreatedEvent,
    meta?: OutboxEventMetadata,
  ): Promise<Result<void, unknown>> {
    const operationId = `invitation-email-${meta?.eventId ?? invitationKey(event.token)}`;
    const data = { ...(await this.buildEmail(event)), operationId };
    const queue = this.queue.getQueue<EmailJobData>("email");
    if (!queue) {
      return err({ type: "EMAIL_QUEUE_UNAVAILABLE" });
    }

    try {
      await queue.add("organization-invitation", data, {
        jobId: operationId,
        attempts: EMAIL_RETRY_ATTEMPTS,
        backoff: { type: "exponential", delay: EMAIL_RETRY_DELAY_MS },
        removeOnComplete: { age: EMAIL_JOB_RETENTION_SECONDS, count: 10_000 },
        removeOnFail: { age: EMAIL_JOB_RETENTION_SECONDS, count: 10_000 },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error({ error, tenantId: event.tenantId }, "Invitation queueing failed");
      return err({ type: "EMAIL_QUEUE_FAILED" });
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
