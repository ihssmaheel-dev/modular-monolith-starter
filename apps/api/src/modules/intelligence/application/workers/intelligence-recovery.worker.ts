import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { TenantContextService } from "../../../../infrastructure/database";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import {
  IntelligenceDocumentRepository,
  IntelligenceRunRepository,
} from "../../infrastructure/repositories/intelligence.repository";
import {
  INTELLIGENCE_DOCUMENT_JOB_PREFIX,
  INTELLIGENCE_DOCUMENT_QUEUE,
  INTELLIGENCE_RUN_JOB_PREFIX,
  INTELLIGENCE_RUN_QUEUE,
} from "../intelligence.constants";

const RECOVERY_BATCH_SIZE = 100;
const RECOVERY_INTERVAL = "*/30 * * * * *";

@Injectable()
export class IntelligenceRecoveryWorker {
  constructor(
    private readonly runs: IntelligenceRunRepository,
    private readonly documents: IntelligenceDocumentRepository,
    private readonly queue: QueueService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron(RECOVERY_INTERVAL)
  async recoverQueuedWork(): Promise<void> {
    if (env.PROCESS_ROLE === "api" || !env.INTELLIGENCE_ENABLED || !env.REDIS_URL) return;
    await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
      const [runs, documents] = await Promise.all([
        this.runs.find({ status: "QUEUED" }, { limit: RECOVERY_BATCH_SIZE }),
        this.documents.find({ status: "QUEUED" }, { limit: RECOVERY_BATCH_SIZE }),
      ]);
      const runQueue = this.queue.getQueue<{ runId: string; tenantId: string }>(
        INTELLIGENCE_RUN_QUEUE,
      );
      if (runQueue && runs.isOk()) {
        for (const run of runs.value) {
          await runQueue.add(
            "generate",
            { runId: run.id, tenantId: run.tenantId },
            {
              jobId: `${INTELLIGENCE_RUN_JOB_PREFIX}${run.id}`,
              removeOnComplete: 100,
              removeOnFail: 1000,
            },
          );
        }
      }
      const documentQueue = this.queue.getQueue<{ documentId: string; tenantId: string }>(
        INTELLIGENCE_DOCUMENT_QUEUE,
      );
      if (documentQueue && documents.isOk()) {
        for (const document of documents.value) {
          await documentQueue.add(
            "index",
            { documentId: document.id, tenantId: document.tenantId },
            {
              jobId: `${INTELLIGENCE_DOCUMENT_JOB_PREFIX}${document.id}`,
              removeOnComplete: 100,
              removeOnFail: 1000,
            },
          );
        }
      }
    });
  }
}
