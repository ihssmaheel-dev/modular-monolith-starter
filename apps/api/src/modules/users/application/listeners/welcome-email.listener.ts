import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { WelcomeEmail, render } from "@repo/email";
import { buildFrontendUrl, FRONTEND_ROUTES, type EmailJobData } from "@repo/contracts";
import * as React from "react";
import { env } from "../../../../config/env";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { UserCreatedEvent } from "../../domain/events/user.events";

const EMAIL_RETRY_ATTEMPTS = 5;
const EMAIL_RETRY_DELAY_MS = 5_000;

@Injectable()
export class WelcomeEmailListener {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly queueService: QueueService,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
  ) {}

  @OnEvent("user.created")
  async handle(event: UserCreatedEvent): Promise<void> {
    const data = await this.buildEmail(event);
    const queue = this.queueService.getQueue<EmailJobData>("email");
    if (queue) {
      try {
        await queue.add("welcome", data, {
          // BullMQ prohibits colons in custom job IDs; hyphens keep the
          // id stable and retryable instead of failing into the fallback.
          jobId: `welcome-email-${event.userId}`,
          attempts: EMAIL_RETRY_ATTEMPTS,
          backoff: { type: "exponential", delay: EMAIL_RETRY_DELAY_MS },
          removeOnComplete: 100,
          removeOnFail: 1000,
        });
        return;
      } catch (error) {
        this.logger.error({ error, userId: event.userId }, "Welcome email queueing failed");
      }
    }

    const result = await this.emailService.send(data);
    if (result.isErr()) {
      this.logger.error({ userId: event.userId, code: result.error.code }, "Welcome email failed");
    }
  }

  private async buildEmail(event: UserCreatedEvent): Promise<EmailJobData> {
    const translate = (key: string, params?: Record<string, string>) =>
      this.i18n.t(key, event.locale, params);
    const html = await render(
      React.createElement(WelcomeEmail, {
        loginUrl: buildFrontendUrl(env.CLIENT_URL, FRONTEND_ROUTES.auth),
        preview: translate("email.welcome.preview"),
        greeting: translate("email.welcome.greeting", { name: event.name }),
        body: translate("email.welcome.body"),
        buttonText: translate("email.welcome.buttonText"),
      }),
    );
    return {
      to: event.email,
      subject: translate("email.welcome.subject"),
      html,
    };
  }
}
