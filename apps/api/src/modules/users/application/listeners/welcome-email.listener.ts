import { Injectable } from "@nestjs/common";
import { WelcomeEmail, render } from "@repo/email";
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
import { ok, err, type Result } from "neverthrow";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { UserCreatedEvent } from "../../domain/events/user.events";

const EMAIL_RETRY_ATTEMPTS = 5;
const EMAIL_RETRY_DELAY_MS = 5_000;
const EMAIL_JOB_RETENTION_SECONDS = 8 * 24 * 60 * 60;

@Injectable()
export class WelcomeEmailListener {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly queueService: QueueService,
    private readonly i18n: I18nService,
  ) {}

  async handle(
    event: UserCreatedEvent,
    meta?: OutboxEventMetadata,
  ): Promise<Result<void, unknown>> {
    const operationId = `welcome-email-${meta?.eventId ?? event.userId}`;
    const data = { ...(await this.buildEmail(event)), operationId };
    const queue = this.queueService.getQueue<EmailJobData>("email");
    if (!queue) {
      return err({ type: "EMAIL_QUEUE_UNAVAILABLE" });
    }

    try {
      await queue.add("welcome", data, {
        jobId: operationId,
        attempts: EMAIL_RETRY_ATTEMPTS,
        backoff: { type: "exponential", delay: EMAIL_RETRY_DELAY_MS },
        removeOnComplete: { age: EMAIL_JOB_RETENTION_SECONDS, count: 10_000 },
        removeOnFail: { age: EMAIL_JOB_RETENTION_SECONDS, count: 10_000 },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error({ error, userId: event.userId }, "Welcome email queueing failed");
      return err({ type: "EMAIL_QUEUE_FAILED" });
    }
  }

  private async buildEmail(event: UserCreatedEvent): Promise<EmailJobData> {
    const translate = (key: string, params?: Record<string, string>) =>
      this.i18n.t(key, event.locale, params);
    const html = await render(
      React.createElement(WelcomeEmail, {
        loginUrl: buildFrontendUrl(env.CLIENT_URL, FRONTEND_ROUTES.login),
        preview: translate("email.welcome.preview", { appName: env.APP_NAME }),
        greeting: translate("email.welcome.greeting", { name: event.name }),
        body: translate("email.welcome.body"),
        buttonText: translate("email.welcome.buttonText"),
      }),
    );
    return {
      to: event.email,
      subject: translate("email.welcome.subject", { appName: env.APP_NAME }),
      html,
    };
  }
}
