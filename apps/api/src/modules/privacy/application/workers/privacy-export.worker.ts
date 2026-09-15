import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { RequestExportCommand } from "../commands/request-export.command";
import { PrivacyRepository } from "../../infrastructure/repositories/privacy.repository";
import { DSR_MAX_ATTEMPTS, type DsrRequest } from "../../domain/entities/dsr.entity";

const EXPORT_BATCH_SIZE = 10;

@Injectable()
export class PrivacyExportWorker {
  private running = false;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly requests: PrivacyRepository,
    private readonly requestExport: RequestExportCommand,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "PrivacyExportWorker" });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPending(): Promise<void> {
    if (env.PROCESS_ROLE === "api" || this.running) return;
    this.running = true;
    try {
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, () => this.processBatch());
    } catch (error) {
      this.logger.error({ error }, "Privacy export batch failed");
    } finally {
      this.running = false;
    }
  }

  private async processBatch(): Promise<void> {
    const requests = await this.database.runTransaction(async () => {
      const expired = await this.requests.expireAbandonedExports();
      if (expired > 0) {
        this.metrics.incrementCounter(
          "privacy_exports_expired_total",
          "Queued privacy exports expired before completion",
          expired,
        );
      }
      await this.measureBacklog();
      return this.requests.claimExportBatch(EXPORT_BATCH_SIZE);
    });
    for (const request of requests) await this.processOne(request);
  }

  private async processOne(request: DsrRequest): Promise<void> {
    const result = await this.requestExport.process(request);
    if (result.isOk()) {
      this.metrics.incrementCounter("privacy_export_jobs_total", "Privacy export job outcomes", 1, {
        outcome: result.value.status === "PARTIAL" ? "partial" : "ready",
      });
      return;
    }
    const terminal = request.attempts >= DSR_MAX_ATTEMPTS;
    await this.database.runTransaction(() =>
      this.requests.markExportAttemptFailed(request.id, terminal),
    );
    this.metrics.incrementCounter("privacy_export_jobs_total", "Privacy export job outcomes", 1, {
      outcome: terminal ? "failed" : "retry",
    });
    this.logger.error(
      { requestId: request.id, attempt: request.attempts },
      terminal ? "Privacy export exhausted retries" : "Privacy export attempt failed",
    );
  }

  private async measureBacklog(): Promise<void> {
    const stats = await this.requests.getExportBacklogStats();
    this.metrics.setGauge(
      "privacy_export_pending_depth",
      "Pending privacy export requests",
      stats.pending,
    );
    this.metrics.setGauge(
      "privacy_export_failed_depth",
      "Failed privacy export requests",
      stats.failed,
    );
    const age = stats.oldestPendingAt ? Date.now() - stats.oldestPendingAt.getTime() : 0;
    this.metrics.setGauge(
      "privacy_export_oldest_pending_age_seconds",
      "Age of the oldest pending privacy export request",
      Math.max(0, age / 1_000),
    );
  }
}
