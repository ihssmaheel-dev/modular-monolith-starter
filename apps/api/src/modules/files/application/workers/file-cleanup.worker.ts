import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";

import { TenantContextService } from "../../../../infrastructure/database";
import { DatabaseService } from "../../../../infrastructure/database";
import { deleteFileObjects } from "../services/file-objects.service";
import { env } from "../../../../config/env";

const PENDING_EXPIRATION_HOURS = 24;
const UNLINKED_EXPIRATION_DAYS = 7;
const CLEANUP_BATCH_SIZE = 500;
const MAX_BATCHES_PER_RUN = 5;

@Injectable()
export class FileCleanupWorker {
  private isRunning = false;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly storageService: StorageService,
    private readonly metrics: MetricsService,
    private readonly tenantContext: TenantContextService,
    private readonly database: DatabaseService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "FileCleanupWorker" });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOrphanPendingFiles(): Promise<{ purgedCount: number; reclaimedBytes: number }> {
    if (env.PROCESS_ROLE === "api") return { purgedCount: 0, reclaimedBytes: 0 };
    if (this.isRunning) {
      this.logger.warn({}, "File cleanup already in progress, skipping run");
      return { purgedCount: 0, reclaimedBytes: 0 };
    }

    const run = async (signal?: AbortSignal) => {
      this.isRunning = true;
      let purgedCount = 0;
      let reclaimedBytes = 0;

      try {
        const cutoff = new Date(Date.now() - PENDING_EXPIRATION_HOURS * 60 * 60 * 1000);
        const unlinkedCutoff = new Date(
          Date.now() - UNLINKED_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
        );
        await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
          for (let index = 0; index < MAX_BATCHES_PER_RUN; index += 1) {
            if (signal?.aborted) break;
            const candidates = await this.findCandidates(cutoff, unlinkedCutoff);
            for (const file of candidates) {
              if (signal?.aborted) break;
              const deleted = await this.purgeFile(file);
              if (deleted) {
                purgedCount += 1;
                reclaimedBytes += file.fileSize;
              }
            }
            if (candidates.length < CLEANUP_BATCH_SIZE * 3) break;
          }
        });

        if (purgedCount > 0) {
          this.metrics.incrementCounter(
            "file_cleanup_purged_total",
            "Total orphan files purged",
            purgedCount,
          );
          this.logger.info({ purgedCount, reclaimedBytes }, "Completed orphan file cleanup run");
        }
      } catch (error) {
        this.logger.error({ error }, "Error during orphan file cleanup execution");
      } finally {
        this.isRunning = false;
      }

      return { purgedCount, reclaimedBytes };
    };

    if (typeof this.database.withExclusiveExecution === "function") {
      const lockResult = await this.database.withExclusiveExecution("worker:file-cleanup", run);
      if (!lockResult.executed) {
        this.logger.info({}, "File cleanup already running on another node, skipping");
        return { purgedCount: 0, reclaimedBytes: 0 };
      }
      return lockResult.result ?? { purgedCount: 0, reclaimedBytes: 0 };
    }

    return run();
  }

  private async findCandidates(cutoff: Date, unlinkedCutoff: Date) {
    const stale = await this.database.runTransaction(() =>
      this.filesRepository.findPendingFilesBefore(cutoff, true, CLEANUP_BATCH_SIZE),
    );
    const unlinked = await this.database.runTransaction(() =>
      this.filesRepository.findUnlinkedBefore(unlinkedCutoff, true, CLEANUP_BATCH_SIZE),
    );
    const deleted = await this.database.runTransaction(() =>
      this.filesRepository.findDeletedFiles(CLEANUP_BATCH_SIZE, true),
    );
    return [...stale, ...unlinked, ...deleted];
  }

  private async purgeFile(file: { id: string; key: string; fileSize: number }): Promise<boolean> {
    try {
      const deletedObject = await deleteFileObjects(this.storageService, file.key);
      if (deletedObject.isErr()) return false;
      const deletedRow = await this.database.runTransaction(() =>
        this.filesRepository.deleteById(file.id),
      );
      return deletedRow.isOk() && Boolean(deletedRow.value);
    } catch (error) {
      this.logger.error({ fileId: file.id, key: file.key, error }, "Failed to purge orphan file");
      return false;
    }
  }
}
