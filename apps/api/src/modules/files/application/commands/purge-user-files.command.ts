import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { TransactionError } from "../../../../infrastructure/database";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { FileError } from "../../domain/errors/file.errors";
import { FilesRepository } from "../../infrastructure/files.repository";
import { deleteFileObjects } from "../file-objects";

const PURGE_BATCH_LIMIT = 500;

/**
 * GDPR erasure fan-out: delete every object uploaded by a subject in the
 * current tenant context (S3 bytes first, then rows). Work proceeds in
 * bounded batches with no long-lived transaction: S3 calls happen outside
 * any transaction, each row delete is atomic, and completed batches survive
 * failures. Idempotent: safe to retry — missing objects are treated as
 * already purged.
 */
@Injectable()
export class PurgeUserFilesCommand {
  constructor(
    private readonly files: FilesRepository,
    private readonly storage: StorageService,
    private readonly logger: PinoLoggerService,
  ) {}

  async execute(
    userId: string,
  ): Promise<Result<{ deleted: number }, FileError | TransactionError>> {
    let deleted = 0;
    for (;;) {
      const items = await this.files.findByUploader(userId, PURGE_BATCH_LIMIT);
      if (items.length === 0) break;
      for (const file of items) {
        const purged = await this.purgeOne(file);
        if (purged.isErr()) return err(purged.error);
        deleted += 1;
      }
      if (items.length < PURGE_BATCH_LIMIT) break;
    }
    return ok({ deleted });
  }

  private async purgeOne(file: { id: string; key: string }): Promise<Result<void, FileError>> {
    const storageResult = await deleteFileObjects(this.storage, file.key);
    if (storageResult.isErr()) {
      this.logger.error({ key: file.key }, "Erasure storage delete failed");
      return err({ type: "DELETE_FAILED", message: "api.error.deleteFailed" });
    }
    const rowResult = await this.files.deleteById(file.id);
    if (rowResult.isErr() || !rowResult.value) {
      return err({ type: "DELETE_FAILED", message: "api.error.deleteFailed" });
    }
    return ok(undefined);
  }
}
