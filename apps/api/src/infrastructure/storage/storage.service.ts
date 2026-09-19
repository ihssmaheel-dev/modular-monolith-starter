import { Injectable, Optional, type OnApplicationShutdown } from "@nestjs/common";
import { ok, err, type Result } from "neverthrow";
import { PinoLoggerService } from "../logger/logger.service";
import {
  StorageDriver,
  StorageError,
  UploadResult,
  FileInput,
  UPLOAD_PRESIGN_TTL_SECONDS,
  DOWNLOAD_PRESIGN_TTL_SECONDS,
  StoredObjectMetadata,
} from "./storage.types";
import { S3Driver } from "./drivers/s3.driver";
import { Readable } from "node:stream";
import { CircuitBreaker } from "../../common/utils/circuit-breaker";
import { Bulkhead } from "../../common/utils/bulkhead";
import { TenantContextService } from "../database";
import { MetricsService } from "../metrics/metrics.service";
import { env } from "../../config/env";
import { StorageMetricsRecorder, type StorageOperation } from "./metrics/storage.metrics";
import { detectStorageProvider } from "./providers/storage-provider.detector";

@Injectable()
export class StorageService implements OnApplicationShutdown {
  private driver: StorageDriver;
  private circuitBreaker: CircuitBreaker<StorageError>;
  private bulkhead: Bulkhead<StorageError>;
  private metricsRecorder: StorageMetricsRecorder;

  constructor(
    private logger: PinoLoggerService,
    private readonly metrics: MetricsService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {
    this.logger = logger.child({ module: "StorageService" });
    this.driver = new S3Driver();
    this.logger.info({}, "Storage: Using S3 driver (Postgres mode)");

    const provider = detectStorageProvider(env.STORAGE_PROVIDER, env.S3_ENDPOINT);
    this.metricsRecorder = new StorageMetricsRecorder(this.metrics, provider);
    this.metricsRecorder.recordCircuitBreakerState("CLOSED");

    this.circuitBreaker = new CircuitBreaker(
      {
        failureThreshold: 5,
        resetTimeoutMs: 10000,
        onStateChange: (state) => this.metricsRecorder.recordCircuitBreakerState(state),
      },
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
    const byteLength = Buffer.isBuffer(body)
      ? body.length
      : typeof body === "string"
        ? Buffer.byteLength(body)
        : undefined;

    return this.timed(
      "upload",
      () =>
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
      () => byteLength,
    );
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds = UPLOAD_PRESIGN_TTL_SECONDS,
  ): Promise<Result<string, StorageError>> {
    return this.timed("presign_upload", () =>
      this.circuitBreaker.execute(async () => {
        try {
          const url = await this.driver.getPresignedUploadUrl(
            key,
            contentType,
            contentLength,
            ttlSeconds,
          );
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

  getBucketName(): string {
    return this.driver.getBucket ? this.driver.getBucket() : env.S3_BUCKET;
  }

  getPublicUrl(key: string): string | null {
    return this.driver.getPublicUrl ? this.driver.getPublicUrl(key) : null;
  }

  private async guarded<T>(
    action: () => Promise<Result<T, StorageError>>,
  ): Promise<Result<T, StorageError>> {
    this.metricsRecorder.incrementBulkhead();
    try {
      // Bulkhead partitions are per-tenant for fairness; the circuit breaker
      // stays global because a downstream S3 outage affects every tenant.
      return await this.bulkhead.execute(action, this.partitionKey());
    } finally {
      this.metricsRecorder.decrementBulkhead();
    }
  }

  private partitionKey(): string {
    return this.tenantContext?.get().tenantId ?? "global";
  }

  private async timed<T>(
    operation: StorageOperation,
    action: () => Promise<Result<T, StorageError>>,
    bytesGetter?: (result: T) => number | undefined,
  ): Promise<Result<T, StorageError>> {
    const start = process.hrtime.bigint();
    const res = await this.guarded(action);
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    this.metricsRecorder.recordDuration(operation, durationSeconds);

    if (res.isOk()) {
      this.metricsRecorder.recordOperation(operation, "success");
      if (bytesGetter) {
        const bytes = bytesGetter(res.value);
        if (bytes && bytes > 0) {
          this.metricsRecorder.recordBytesTransferred("in", bytes);
        }
      }
    } else {
      this.metricsRecorder.recordOperation(operation, "error");
      this.metricsRecorder.recordError(operation, res.error.code);
    }

    return res;
  }

  async getPresignedDownloadUrl(
    key: string,
    ttlSeconds = DOWNLOAD_PRESIGN_TTL_SECONDS,
    options?: { filename?: string },
  ): Promise<Result<string, StorageError>> {
    return this.timed("presign_download", () =>
      this.circuitBreaker.execute(async () => {
        try {
          const url = await this.driver.getPresignedDownloadUrl(key, ttlSeconds, options);
          return ok(url);
        } catch (error) {
          this.logger.error({ key, error }, "Presign download failed");
          return err({ code: "NOT_FOUND", message: "api.error.notFound" });
        }
      }),
    );
  }

  async delete(key: string): Promise<Result<void, StorageError>> {
    return this.timed("delete", () =>
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

  /**
   * Server-side copy used for quarantine promotion: the approved bytes move
   * to the final key, so a still-valid presigned upload URL (which points at
   * the quarantine key) can never overwrite served content afterwards.
   */
  async copy(
    sourceKey: string,
    destinationKey: string,
    source: Pick<StoredObjectMetadata, "etag" | "versionId">,
  ): Promise<Result<void, StorageError>> {
    return this.timed("copy", () =>
      this.circuitBreaker.execute(async () => {
        try {
          await this.driver.copy(sourceKey, destinationKey, source);
          this.logger.info({ sourceKey, destinationKey }, "File promoted from quarantine");
          return ok(undefined);
        } catch (error) {
          this.logger.error({ sourceKey, destinationKey, error }, "Quarantine promote failed");
          return err({ code: "COPY_FAILED", message: "api.error.uploadFailed" });
        }
      }),
    );
  }

  async getMetadata(key: string): Promise<Result<StoredObjectMetadata | null, StorageError>> {
    return this.timed("metadata", () =>
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
    return this.timed("download_stream", () =>
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

  async onApplicationShutdown(): Promise<void> {
    await this.driver.destroy?.();
  }
}
