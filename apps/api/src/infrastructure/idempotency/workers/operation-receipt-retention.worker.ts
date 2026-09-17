import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { env } from "../../../config/env";
import { DatabaseService, TenantContextService } from "../../database";
import { PinoLoggerService } from "../../logger/logger.service";
import { OperationReceiptRepository } from "../repositories/operation-receipt.repository";

const RETENTION_BATCH_SIZE = 1_000;
const MAX_BATCHES_PER_RUN = 10;

@Injectable()
export class OperationReceiptRetentionWorker {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly receipts: OperationReceiptRepository,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "OperationReceiptRetentionWorker" });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async deleteExpired(): Promise<void> {
    if (env.PROCESS_ROLE === "api") return;
    try {
      const deleted = await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, () =>
        this.deleteBatches(),
      );
      if (deleted > 0) this.logger.info({ deleted }, "Deleted expired operation receipts");
    } catch (error) {
      this.logger.error({ error }, "Operation receipt retention failed");
    }
  }

  private async deleteBatches(): Promise<number> {
    let total = 0;
    for (let index = 0; index < MAX_BATCHES_PER_RUN; index += 1) {
      const deleted = await this.database.withSystemScope(() =>
        this.database.runTransaction(() => this.receipts.deleteExpired(RETENTION_BATCH_SIZE)),
      );
      total += deleted;
      if (deleted < RETENTION_BATCH_SIZE) break;
    }
    return total;
  }
}
