import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { FileScannerService } from "../../../../infrastructure/storage/scanner/file-scanner.service";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { StoredObjectMetadata } from "../../../../infrastructure/storage/storage.types";
import type { FileEntity } from "../../domain/entities/file.entity";
import {
  promotionCandidateKeyFor,
  quarantineKeyFor,
} from "../../domain/value-objects/file-keys.vo";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";

const SCAN_BATCH_SIZE = 50;
const SCAN_LEASE_MS = 2 * 60 * 1_000;
const SCAN_MAX_ATTEMPTS = 5;
const SCAN_RETRY_BASE_MS = 5_000;
const SCAN_RETRY_MAX_MS = 5 * 60 * 1_000;

/** The only owner of scan, promotion, and terminal upload transitions. */
@Injectable()
export class FileScanWorker {
  private readonly logger: PinoLoggerService;
  private running = false;

  constructor(
    private readonly files: FilesRepository,
    private readonly scanner: FileScannerService,
    private readonly storage: StorageService,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "FileScanWorker" });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scanQuarantinedFiles(): Promise<void> {
    if (env.PROCESS_ROLE === "api" || this.running) return;
    this.running = true;
    try {
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
        const claims = await this.database.runTransaction(() =>
          this.files.claimUploadingFiles(SCAN_BATCH_SIZE, SCAN_LEASE_MS, SCAN_MAX_ATTEMPTS, true),
        );
        for (const claim of claims) await this.scanOne(claim);
      });
    } catch (error) {
      this.logger.error({ error }, "Quarantine scan failed");
    } finally {
      this.running = false;
    }
  }

  async scanOne(file: FileEntity): Promise<boolean> {
    const claimToken = file.scanClaimToken;
    this.metrics.recordHistogram(
      "file_scan_attempts",
      "File scan attempt number when processing starts",
      file.scanAttempts ?? 1,
      undefined,
      [1, 2, 3, 4, 5],
    );
    if (!claimToken) {
      this.logger.error({ fileId: file.id }, "Scan claim is missing its fencing token");
      return false;
    }

    const quarantineKey = quarantineKeyFor(file.key);
    const source = await this.storage.getMetadata(quarantineKey);
    if (source.isErr() || !source.value) {
      await this.retry(file, claimToken, source.isErr() ? source.error.code : "OBJECT_MISSING");
      return false;
    }
    if (!this.matchesSource(file, source.value)) {
      await this.reject(file, claimToken, "SOURCE_METADATA_MISMATCH", quarantineKey);
      return false;
    }
    if (!(await this.renewLease(file.id, claimToken))) return false;

    const scan = await this.scanner.scan({ ...file, ...source.value, key: quarantineKey });
    if ("error" in scan) {
      await this.retry(file, claimToken, scan.error);
      return false;
    }
    if (scan.result !== "clean") {
      await this.reject(file, claimToken, "CONTENT_REJECTED", quarantineKey);
      return false;
    }
    if (!(await this.renewLease(file.id, claimToken))) return false;

    const candidateKey = promotionCandidateKeyFor(file.key, claimToken);
    const copied = await this.storage.copy(quarantineKey, candidateKey, source.value);
    if (copied.isErr()) {
      await this.retry(file, claimToken, copied.error.code);
      return false;
    }
    const promoted = await this.storage.getMetadata(candidateKey);
    if (
      promoted.isErr() ||
      !promoted.value ||
      !this.matchesPromoted(source.value, promoted.value)
    ) {
      await this.storage.delete(candidateKey);
      await this.reject(file, claimToken, "PROMOTED_METADATA_MISMATCH");
      return false;
    }

    const completed = await this.database.runTransaction(() =>
      this.files.completeScan(file.id, claimToken, candidateKey),
    );
    if (!completed) {
      await this.storage.delete(candidateKey);
      return false;
    }

    await this.cleanupAfterWin(file, candidateKey, quarantineKey);
    this.metrics.incrementCounter("file_scan_outcomes_total", "File scan outcomes", 1, {
      outcome: "uploaded",
    });
    return true;
  }

  private renewLease(fileId: string, claimToken: string): Promise<boolean> {
    return this.database.runTransaction(() =>
      this.files.renewScanLease(fileId, claimToken, SCAN_LEASE_MS),
    );
  }

  private async retry(file: FileEntity, claimToken: string, failureCode: string): Promise<void> {
    const attempts = file.scanAttempts ?? 1;
    const exponent = Math.max(0, attempts - 1);
    const delay = Math.min(SCAN_RETRY_MAX_MS, SCAN_RETRY_BASE_MS * 2 ** exponent);
    await this.database.runTransaction(() =>
      this.files.retryScan(
        file.id,
        claimToken,
        failureCode,
        new Date(Date.now() + delay),
        SCAN_MAX_ATTEMPTS,
      ),
    );
    this.metrics.incrementCounter("file_scan_outcomes_total", "File scan outcomes", 1, {
      outcome: attempts >= SCAN_MAX_ATTEMPTS ? "attempts_exhausted" : "retry",
    });
    this.logger.warn(
      { fileId: file.id, failureCode, attempt: attempts },
      "File scan scheduled for retry",
    );
  }

  private async reject(
    file: FileEntity,
    claimToken: string,
    failureCode: string,
    quarantineKey?: string,
  ): Promise<void> {
    const rejected = await this.database.runTransaction(() =>
      this.files.rejectScan(file.id, claimToken, failureCode),
    );
    if (rejected && quarantineKey) await this.storage.delete(quarantineKey);
    this.metrics.incrementCounter("file_scan_outcomes_total", "File scan outcomes", 1, {
      outcome: "rejected",
    });
    this.logger.warn({ fileId: file.id, failureCode }, "File rejected by quarantine scan");
  }

  private async cleanupAfterWin(
    file: FileEntity,
    activeKey: string,
    quarantineKey: string,
  ): Promise<void> {
    const quarantineDelete = await this.storage.delete(quarantineKey);
    if (quarantineDelete.isErr()) {
      this.logger.warn({ fileId: file.id }, "Quarantine cleanup failed after promotion");
    }
    for (const candidate of file.scanCandidateKeys ?? []) {
      if (candidate === activeKey) continue;
      const removed = await this.storage.delete(candidate);
      if (removed.isErr()) {
        this.logger.warn({ fileId: file.id }, "Abandoned promotion cleanup failed");
      }
    }
  }

  private matchesSource(file: FileEntity, metadata: StoredObjectMetadata): boolean {
    if (metadata.size !== file.fileSize || metadata.contentType !== file.contentType) return false;
    if (file.scanSourceVersionId && metadata.versionId !== file.scanSourceVersionId) return false;
    return !file.scanSourceEtag || metadata.etag === file.scanSourceEtag;
  }

  private matchesPromoted(source: StoredObjectMetadata, promoted: StoredObjectMetadata): boolean {
    if (source.size !== promoted.size || source.contentType !== promoted.contentType) return false;
    if (!source.checksumSha256) return true;
    return source.checksumSha256 === promoted.checksumSha256;
  }
}
