import { Injectable, Optional } from "@nestjs/common";
import { ok, err, type Result } from "neverthrow";
import { PinoLoggerService } from "../logger/logger.service";
import {
  StorageDriver,
  StorageError,
  UploadResult,
  FileInput,
  PRESIGN_TTL_SECONDS,
  StoredObjectMetadata,
} from "./storage.types";
import { S3Driver } from "./drivers/s3.driver";
import { Readable } from "node:stream";
import { CircuitBreaker } from "../../common/utils/circuit-breaker";
import { Bulkhead } from "../../common/utils/bulkhead";
import { TenantContextService } from "../database";

@Injectable()
export class StorageService {
  private driver: StorageDriver;
  private circuitBreaker: CircuitBreaker<StorageError>;
  private bulkhead: Bulkhead<StorageError>;
  constructor(
    private logger: PinoLoggerService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {
    this.logger = logger.child({ module: "StorageService" });
    this.driver = new S3Driver();
    this.logger.info({}, "Storage: Using S3 driver (Postgres mode)");
    this.circuitBreaker = new CircuitBreaker(
      { failureThreshold: 5, resetTimeoutMs: 10000 },
      { code: "CIRCUIT_OPEN", message: "api.error.circuitOpen" },
    );
    this.bulkhead = new Bulkhead(
      { maxConcurrent: 20 },
      { code: "BULKHEAD_REJECTED", message: "api.error.bulkheadRejected" },
    );
  }

  async upload(
    key: string,
    body: FileInput,
    contentType: string,
  ): Promise<Result<UploadResult, StorageError>> {
    return this.guarded(() =>
      this.circuitBreaker.execute(async () => {
        try {
          const result = await this.driver.upload(key, body, contentType);
          this.logger.info({ key, contentType }, "File uploaded");
          return ok(result);
        } catch (error) {
          this.logger.error({ key, error }, "Upload failed");
          return err({ code: "UPLOAD_FAILED", message: "api.error.uploadFailed" });
        }
      }),
    );
  }
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    ttlSeconds = PRESIGN_TTL_SECONDS,
  ): Promise<Result<string, StorageError>> {
    return this.guarded(() =>
      this.circuitBreaker.execute(async () => {
        try {
          const url = await this.driver.getPresignedUploadUrl(key, contentType, ttlSeconds);
          return ok(url);
        } catch (error) {
          this.logger.error({ key, error }, "Presign upload failed");
          return err({ code: "PRESIGN_FAILED", message: "api.error.presignFailed" });
        }
      }),
    );
  }
  usesDirectTransfer(): boolean {
    return true;
  }

  private guarded<T>(action: () => Promise<Result<T, StorageError>>): Promise<Result<T, StorageError>> {
    // Bulkhead partitions are per-tenant for fairness; the circuit breaker
    // stays global because a downstream S3 outage affects every tenant.
    return this.bulkhead.execute(action, this.partitionKey());
  }

  private partitionKey(): string {
    return this.tenantContext?.get().tenantId ?? "global";
  }

  async getPresignedDownloadUrl(
    key: string,
    ttlSeconds = PRESIGN_TTL_SECONDS,
  ): Promise<Result<string, StorageError>> {
    return this.guarded(() =>
      this.circuitBreaker.execute(async () => {
        try {
          const url = await this.driver.getPresignedDownloadUrl(key, ttlSeconds);
          return ok(url);
        } catch (error) {
          this.logger.error({ key, error }, "Presign download failed");
          return err({ code: "NOT_FOUND", message: "api.error.notFound" });
        }
      }),
    );
  }

  async delete(key: string): Promise<Result<void, StorageError>> {
    return this.guarded(() =>
      this.circuitBreaker.execute(async () => {
        try {
          await this.driver.delete(key);
          this.logger.info({ key }, "File deleted");
          return ok(undefined);
        } catch (error) {
          this.logger.error({ key, error }, "Delete failed");
          return err({ code: "DELETE_FAILED", message: "api.error.deleteFailed" });
        }
      }),
    );
  }

  async getMetadata(key: string): Promise<Result<StoredObjectMetadata | null, StorageError>> {
    return this.guarded(() =>
      this.circuitBreaker.execute(async () => {
        try {
          return ok(await this.driver.getMetadata(key));
        } catch (error) {
          this.logger.error({ key, error }, "Storage existence check failed");
          return err({ code: "NOT_FOUND", message: "api.error.notFound" });
        }
      }),
    );
  }

  async getDownloadStream(key: string): Promise<Result<Readable, StorageError>> {
    return this.guarded(() =>
      this.circuitBreaker.execute(async () => {
        try {
          return ok(await this.driver.getDownloadStream(key));
        } catch (error) {
          this.logger.error({ key, error }, "Download stream failed");
          return err({ code: "DOWNLOAD_FAILED", message: "api.error.notFound" });
        }
      }),
    );
  }
}
