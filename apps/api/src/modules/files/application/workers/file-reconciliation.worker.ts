import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { FilesRepository } from "../../infrastructure/files.repository";

const RECONCILIATION_BATCH_SIZE = 100;

@Injectable()
export class FileReconciliationWorker {
  private running = false;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly files: FilesRepository,
    private readonly storage: StorageService,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "FileReconciliationWorker" });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileUploadedFiles(): Promise<{ checked: number; repaired: number }> {
    if (env.PROCESS_ROLE === "api" || this.running) return { checked: 0, repaired: 0 };
    this.running = true;
    let checked = 0;
    let repaired = 0;
    try {
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
        const files = await this.database.runTransaction(() =>
          this.files.findUploadedFiles(RECONCILIATION_BATCH_SIZE, true),
        );
        for (const file of files) {
          checked += 1;
          const metadata = await this.storage.getMetadata(file.key);
          if (metadata.isErr()) {
            this.metrics.incrementCounter(
              "file_reconciliation_error_total",
              "File reconciliation errors",
            );
            continue;
          }
          if (
            metadata.value &&
            metadata.value.size === file.fileSize &&
            metadata.value.contentType === file.contentType
          )
            continue;
          const result = await this.database.runTransaction(() =>
            this.files.updateById(file.id, { status: "failed" }),
          );
          if (result.isOk() && result.value) repaired += 1;
        }
      });
    } catch (error) {
      this.logger.error({ error }, "File reconciliation failed");
    } finally {
      this.running = false;
    }
    if (repaired > 0) {
      this.metrics.incrementCounter(
        "file_reconciliation_repaired_total",
        "Files marked failed after reconciliation",
        repaired,
      );
      this.logger.warn({ checked, repaired }, "File reconciliation repaired metadata drift");
    }
    return { checked, repaired };
  }
}
