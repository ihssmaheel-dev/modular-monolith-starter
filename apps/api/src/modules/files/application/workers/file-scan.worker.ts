import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { FileScannerService } from "../../../../infrastructure/storage/file-scanner.service";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { quarantineKeyFor } from "../../domain/value-objects/file-keys.vo";

const SCAN_BATCH_SIZE = 50;

/** Promotes only objects that pass integrity and optional antivirus scanning. */
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
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "FileScanWorker" });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scanQuarantinedFiles(): Promise<void> {
    if (env.PROCESS_ROLE === "api") return;
    if (this.running) return;
    this.running = true;
    try {
      await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, async () => {
        const files = await this.database.runTransaction(() =>
          this.files.claimUploadingFiles(SCAN_BATCH_SIZE, true),
        );
        for (const file of files) await this.scanOne(file);
      });
    } catch (error) {
      this.logger.error({ error }, "Quarantine scan failed");
    } finally {
      this.running = false;
    }
  }

  private async scanOne(file: { id: string; key: string; fileSize: number; contentType: string }) {
    const quarantineKey = quarantineKeyFor(file.key);
    const scan = await this.scanner.scan({ ...file, key: quarantineKey });
    const clean = "result" in scan && scan.result === "clean";
    if (clean) {
      // Promote by server-side copy, then verify the promoted bytes still
      // match: anything overwritten through the (still-valid) upload URL in
      // between only ever touched the quarantine object.
      const copied = await this.storage.copy(quarantineKey, file.key);
      if (copied.isErr()) {
        this.logger.error({ fileId: file.id, key: file.key }, "Quarantine promote failed");
        return;
      }
      const promoted = await this.storage.getMetadata(file.key);
      if (promoted.isErr() || !promoted.value || promoted.value.size !== file.fileSize) {
        this.logger.error({ fileId: file.id, key: file.key }, "Promoted bytes mismatch");
        await this.storage.delete(file.key);
        await this.markFailed(file.id);
        return;
      }
      await this.database.runTransaction(() =>
        this.files.updateById(file.id, { status: "uploaded" }),
      );
      const cleaned = await this.storage.delete(quarantineKey);
      if (cleaned.isErr()) {
        this.logger.warn({ fileId: file.id, key: quarantineKey }, "Quarantine cleanup failed");
      }
      return;
    }
    await this.markFailed(file.id);
    const cleaned = await this.storage.delete(quarantineKey);
    if (cleaned.isErr()) {
      this.logger.warn({ fileId: file.id, key: quarantineKey }, "Quarantine cleanup failed");
    }
    this.logger.warn(
      { fileId: file.id, key: file.key, error: "error" in scan ? scan.error : "unknown" },
      "File failed quarantine scan",
    );
  }

  private async markFailed(fileId: string): Promise<void> {
    await this.database.runTransaction(() => this.files.updateById(fileId, { status: "failed" }));
  }
}
