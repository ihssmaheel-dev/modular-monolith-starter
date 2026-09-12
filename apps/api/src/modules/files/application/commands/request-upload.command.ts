import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { randomUUID } from "crypto";
import { env } from "../../../../config/env";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import type { FileError } from "../../domain/errors/file.errors";
import type { FileEntity } from "../../domain/entities/file.entity";
import type { AuthenticatedUser, RequestUploadInput } from "@repo/contracts";
import { TenantContextService } from "../../../../infrastructure/database";
import { env as runtimeEnv } from "../../../../config/env";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { quarantineKeyFor } from "../../domain/value-objects/file-keys.vo";

// Short-lived: with quarantine promotion the URL only needs to cover the
// actual upload, and a smaller window shrinks abuse of leaked URLs.
const PRESIGNED_UPLOAD_TTL_SECONDS = 900;

interface RequestUploadResult {
  uploadMode: "direct" | "proxy";
  uploadUrl: string;
  fileKey: string;
  expiresAt?: string;
}

@Injectable()
export class RequestUploadCommand {
  constructor(
    private readonly storage: StorageService,
    private readonly filesRepo: FilesRepository,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly database?: DatabaseService,
    @Optional() logger?: PinoLoggerService,
  ) {
    this.logger = logger?.child({ module: "RequestUploadCommand" });
  }

  private readonly logger?: PinoLoggerService;

  async execute(
    input: RequestUploadInput,
    actor: AuthenticatedUser,
  ): Promise<Result<RequestUploadResult, FileError>> {
    const userId = actor.sub;
    const fileKey = this.buildKey(input, userId);

    const createResult = await this.createFileRecord(fileKey, input, userId);
    if (createResult.isErr()) {
      if (createResult.error.type === "QUOTA_EXCEEDED") return err(createResult.error);
      return err({
        type: "UPLOAD_FAILED",
        message: "api.error.uploadFailed",
      });
    }

    const transfer = await this.createTransfer(fileKey, input.contentType);
    if (transfer.isErr()) {
      await this.markFailed(createResult.value.id);
      return err({
        type: "PRESIGN_FAILED",
        message: "api.error.presignFailed",
      });
    }

    return ok({ ...transfer.value, fileKey });
  }

  private async createFileRecord(
    fileKey: string,
    input: RequestUploadInput,
    userId: string,
  ): Promise<Result<{ id: string }, FileError | TransactionError>> {
    const create = async (): Promise<Result<FileEntity, FileError>> => {
      const reserve = async (): Promise<Result<FileEntity, FileError>> => {
        const quota = await this.checkQuota(input.fileSize, userId);
        if (!quota) return err({ type: "QUOTA_EXCEEDED", message: "api.error.quotaExceeded" });
        return this.filesRepo.create({
          key: fileKey,
          fileName: input.fileName,
          contentType: input.contentType,
          fileSize: input.fileSize,
          bucket: env.S3_BUCKET,
          parentType: "general",
          uploadedBy: userId,
          status: "pending",
        });
      };
      // Serialize quota check + reservation per user so concurrent uploads
      // cannot each observe headroom and jointly exceed the quota.
      if (this.database) {
        return this.database.withAdvisoryLock(`upload-quota:${userId}`, reserve);
      }
      return reserve();
    };
    return this.database ? this.database.withResultTransaction(create) : create();
  }

  private async markFailed(fileId: string): Promise<void> {
    const repository = this.filesRepo as unknown as {
      updateById?: (id: string, update: Record<string, string>) => Promise<unknown>;
    };
    if (!repository.updateById) return;
    try {
      const update = () => repository.updateById!(fileId, { status: "failed" });
      if (this.database) await this.database.runTransaction(update);
      else await update();
    } catch (error) {
      this.logger?.warn({ fileId, error }, "Failed upload cleanup deferred");
    }
  }

  private async checkQuota(fileSize: number, userId: string): Promise<boolean> {
    const repository = this.filesRepo as unknown as {
      sumActiveBytes?: (uploadedBy: string) => Promise<number>;
    };
    if (!repository.sumActiveBytes) return true;
    // Runs inside the caller's unit of work (under the quota lock), so the
    // sum and the subsequent insert observe the same serialized state.
    const current = await repository.sumActiveBytes(userId);
    return current + fileSize <= runtimeEnv.FILE_USER_QUOTA_BYTES;
  }

  private async createTransfer(fileKey: string, contentType: string) {
    // Presign the quarantine object, never the final key: only the scan
    // worker promotes approved bytes, so post-approval overwrites through
    // this URL cannot reach served content.
    const quarantineKey = quarantineKeyFor(fileKey);
    const result = await this.storage.getPresignedUploadUrl(
      quarantineKey,
      contentType,
      PRESIGNED_UPLOAD_TTL_SECONDS,
    );
    if (result.isErr()) return err(result.error);
    const expiresAt = new Date(Date.now() + PRESIGNED_UPLOAD_TTL_SECONDS * 1_000);
    return ok({
      uploadMode: "direct" as const,
      uploadUrl: result.value,
      expiresAt: expiresAt.toISOString(),
    });
  }

  private buildKey(input: RequestUploadInput, userId: string): string {
    const uuid = randomUUID();
    const sanitized = input.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    // Uploads are parent-agnostic (linked later by the owning module), so keys
    // are always user-scoped: ownership is provable from the path alone.
    const tenantId = this.tenantContext.get().tenantId;
    const tenantPrefix = tenantId ? `tenants/${tenantId}/` : "";
    return `${tenantPrefix}general/${userId}/${uuid}-${sanitized}`;
  }
}
