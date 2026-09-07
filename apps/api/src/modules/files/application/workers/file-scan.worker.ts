import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { FileScannerService } from "../../../../infrastructure/storage/file-scanner.service";
import { FilesRepository } from "../../infrastructure/files.repository";

const SCAN_BATCH_SIZE = 50;

/** Promotes only objects that pass integrity and optional antivirus scanning. */
@Injectable()
export class FileScanWorker {
  private readonly logger: PinoLoggerService;
  private running = false;

  constructor(
    private readonly files: FilesRepository,
    private readonly scanner: FileScannerService,
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
    const scan = await this.scanner.scan(file);
    const clean = "result" in scan && scan.result === "clean";
    await this.database.runTransaction(() =>
      this.files.updateById(file.id, { status: clean ? "uploaded" : "failed" }),
    );
    if (!clean) {
      this.logger.warn(
        { fileId: file.id, key: file.key, error: "error" in scan ? scan.error : "unknown" },
        "File failed quarantine scan",
      );
    }
  }
}
