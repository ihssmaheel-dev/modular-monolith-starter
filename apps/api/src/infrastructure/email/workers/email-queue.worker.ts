import { Injectable, OnModuleInit } from "@nestjs/common";
import type { EmailJobData } from "@repo/contracts";
import { PinoLoggerService } from "../../logger/logger.service";
import { QueueService } from "../../queue/queue.service";
import { EmailService } from "../email.service";
import { env } from "../../../config/env";

@Injectable()
export class EmailQueueWorker implements OnModuleInit {
  constructor(
    private readonly queueService: QueueService,
    private readonly emailService: EmailService,
    private readonly logger: PinoLoggerService,
  ) {}

  onModuleInit(): void {
    if (env.PROCESS_ROLE === "api") return;
    const worker = this.queueService.addWorker<EmailJobData>("email", async (job) =>
      this.send(job.data),
    );
    if (!worker) this.logger.warn({}, "Email queue disabled because Redis is unavailable");
  }

  private async send(data: EmailJobData): Promise<void> {
    const result = await this.emailService.send(data);
    if (result.isOk()) return;
    this.logger.error({ code: result.error.code }, "Queued email delivery failed");
    throw new Error(result.error.message);
  }
}
