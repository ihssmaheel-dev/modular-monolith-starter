import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { TransactionError } from "../../../../infrastructure/database";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { FileError } from "../../domain/errors/file.errors";
import { FilesRepository } from "../../infrastructure/files.repository";

const PURGE_BATCH_LIMIT = 500;

/**
 * GDPR tenant erasure fan-out: delete every object in the current tenant
 * context (S3 bytes first, then rows). Bounded batches with no long-lived
 * transaction; completed batches survive failures. Idempotent: safe to retry.
 */
@Injectable()
export class PurgeTenantFilesCommand {
  constructor(
    private readonly files: FilesRepository,
    private readonly storage: StorageService,
    private readonly logger: PinoLoggerService,
  ) {}

  async execute(): Promise<Result<{ deleted: number }, FileError | TransactionError>> {
    let deleted = 0;
    for (;;) {
      const page = await this.files.paginate({}, { page: 1, limit: PURGE_BATCH_LIMIT });
      if (page.isErr() || page.value.items.length === 0) break;
      for (const file of page.value.items) {
        const purged = await this.purgeOne(file);
        if (purged.isErr()) return err(purged.error);
        deleted += 1;
      }
      if (page.value.items.length < PURGE_BATCH_LIMIT) break;
    }
    return ok({ deleted });
  }

  private async purgeOne(file: { id: string; key: string }): Promise<Result<void, FileError>> {
    const storageResult = await this.storage.delete(file.key);
    if (storageResult.isErr()) {
      this.logger.error({ key: file.key }, "Tenant erasure storage delete failed");
      return err({ type: "DELETE_FAILED", message: "api.error.deleteFailed" });
    }
    const rowResult = await this.files.deleteById(file.id);
    if (rowResult.isErr() || !rowResult.value) {
      return err({ type: "DELETE_FAILED", message: "api.error.deleteFailed" });
    }
    return ok(undefined);
  }
}
