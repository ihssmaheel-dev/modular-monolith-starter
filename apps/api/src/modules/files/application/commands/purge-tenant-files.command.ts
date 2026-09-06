import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { FileError } from "../../domain/errors/file.errors";
import { FilesRepository } from "../../infrastructure/files.repository";

/**
 * GDPR tenant erasure fan-out: delete every object in the current tenant
 * context (S3 bytes first, then rows). Idempotent: safe to retry.
 */
@Injectable()
export class PurgeTenantFilesCommand {
  constructor(
    private readonly files: FilesRepository,
    private readonly storage: StorageService,
    private readonly logger: PinoLoggerService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(): Promise<Result<{ deleted: number }, FileError | TransactionError>> {
    const operation = async (): Promise<Result<{ deleted: number }, FileError>> => {
      const found = await this.files.find({});
      const items = found.isOk() ? found.value : [];
      let deleted = 0;
      for (const file of items) {
        const storageResult = await this.storage.delete(file.key);
        if (storageResult.isErr()) {
          this.logger.error({ key: file.key }, "Tenant erasure storage delete failed");
          return err({ type: "DELETE_FAILED", message: "api.error.deleteFailed" });
        }
        const rowResult = await this.files.deleteById(file.id);
        if (rowResult.isErr() || !rowResult.value) {
          return err({ type: "DELETE_FAILED", message: "api.error.deleteFailed" });
        }
        deleted += 1;
      }
      return ok({ deleted });
    };
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }
}
