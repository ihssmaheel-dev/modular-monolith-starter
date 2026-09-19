import { ok, err, Result } from "neverthrow";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EmailDriver, EmailError, SendEmailParams, SendEmailResult } from "../email.types";
import { env } from "../../../config/env";
import { PinoLoggerService } from "../../logger/logger.service";

export class SmtpDriver implements EmailDriver {
  private transporter: Transporter;
  private logger: PinoLoggerService;

  constructor(logger: PinoLoggerService) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    this.logger = logger.child({ module: "SmtpDriver" });
  }

  async send(
    recipients: string[],
    params: SendEmailParams,
  ): Promise<Result<SendEmailResult, EmailError>> {
    try {
      const info = await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: recipients.join(", "),
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(params.operationId ? { messageId: `<${params.operationId}@${emailDomain()}>` } : {}),
      });

      this.logger.info({ messageId: info.messageId, to: recipients }, "Email sent via SMTP");
      return ok({
        id: info.messageId,
        provider: "smtp",
      });
    } catch (error) {
      this.logger.error({ error }, "SMTP send failed");
      return err({
        code: "SEND_FAILED",
        message: "api.error.sendFailed",
      });
    }
  }

  close(): void {
    this.transporter.close();
  }
}

function emailDomain(): string {
  return env.EMAIL_FROM.split("@")[1] ?? "localhost";
}
