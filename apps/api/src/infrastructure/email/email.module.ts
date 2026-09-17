import { Module, Global } from "@nestjs/common";
import { EmailService } from "./email.service";
import { EmailQueueWorker } from "./workers/email-queue.worker";

@Global()
@Module({
  providers: [EmailService, EmailQueueWorker],
  exports: [EmailService],
})
export class EmailModule {}
