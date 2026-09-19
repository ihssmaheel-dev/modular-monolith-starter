import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageService } from "./storage.service";
import type { PinoLoggerService } from "../logger/logger.service";
import type { MetricsService } from "../metrics/metrics.service";
import { STORAGE_DURATION_BUCKETS } from "./metrics/storage.metrics";

const mockDriverInstance = {
  upload: vi.fn(),
  delete: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
  getMetadata: vi.fn(),
  getDownloadStream: vi.fn(),
  copy: vi.fn(),
  getPublicUrl: vi.fn(),
  getBucket: vi.fn().mockReturnValue("test-bucket"),
  destroy: vi.fn(),
};

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
    STORAGE_DRIVER: "s3",
    STORAGE_PROVIDER: undefined,
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "test-bucket",
    S3_ACCESS_KEY_ID: "minioadmin",
    S3_SECRET_ACCESS_KEY: "minioadmin",
    S3_FORCE_PATH_STYLE: true,
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
  },
}));

vi.mock("./drivers/s3.driver", () => {
  return {
    S3Driver: class {
      upload = (...args: unknown[]) => mockDriverInstance.upload(...args);
      delete = (...args: unknown[]) => mockDriverInstance.delete(...args);
      getPresignedDownloadUrl = (...args: unknown[]) =>
        mockDriverInstance.getPresignedDownloadUrl(...args);
      getPresignedUploadUrl = (...args: unknown[]) =>
        mockDriverInstance.getPresignedUploadUrl(...args);
      getMetadata = (...args: unknown[]) => mockDriverInstance.getMetadata(...args);
      getDownloadStream = (...args: unknown[]) => mockDriverInstance.getDownloadStream(...args);
      copy = (...args: unknown[]) => mockDriverInstance.copy(...args);
      getPublicUrl = (...args: unknown[]) => mockDriverInstance.getPublicUrl(...(args as [string]));
      getBucket = () => mockDriverInstance.getBucket();
      destroy = () => mockDriverInstance.destroy();
    },
  };
});

describe("StorageService", () => {
  let service: StorageService;
  let mockMetrics: {
    incrementCounter: ReturnType<typeof vi.fn>;
    recordHistogram: ReturnType<typeof vi.fn>;
    setGauge: ReturnType<typeof vi.fn>;
    incrementGauge: ReturnType<typeof vi.fn>;
    decrementGauge: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDriverInstance.upload.mockResolvedValue({ url: "test", key: "test" });
    mockDriverInstance.delete.mockResolvedValue(undefined);
    mockDriverInstance.getPresignedDownloadUrl.mockResolvedValue("http://dl");
    mockDriverInstance.getPresignedUploadUrl.mockResolvedValue("http://ul");
    mockDriverInstance.getMetadata.mockResolvedValue({ size: 4, contentType: "text/plain" });
    mockDriverInstance.getDownloadStream.mockResolvedValue({ pipe: vi.fn() });
    mockDriverInstance.copy.mockResolvedValue(undefined);

    const mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    mockLogger.child = () => mockLogger;

    mockMetrics = {
      incrementCounter: vi.fn(),
      recordHistogram: vi.fn(),
      setGauge: vi.fn(),
      incrementGauge: vi.fn(),
      decrementGauge: vi.fn(),
    };

    service = new StorageService(mockLogger, mockMetrics as unknown as MetricsService);
  });

  it("sets initial circuit breaker gauge to CLOSED (0) at startup", () => {
    expect(mockMetrics.setGauge).toHaveBeenCalledWith(
      "circuit_breaker_state",
      "Circuit breaker state (0=closed, 1=half, 2=open)",
      0,
      { name: "storage" },
    );
  });

  it("should upload file successfully and record full telemetry", async () => {
    const result = await service.upload("file.txt", Buffer.from("test"), "text/plain");
    expect(result.isOk()).toBe(true);

    // Operation counter
    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_operations_total",
      "Total number of storage operations",
      1,
      { operation: "upload", provider: "minio", status: "success" },
    );

    // Duration histogram with explicit buckets
    expect(mockMetrics.recordHistogram).toHaveBeenCalledWith(
      "storage_operation_duration_seconds",
      "Duration of storage operations in seconds",
      expect.any(Number),
      { operation: "upload", provider: "minio" },
      STORAGE_DURATION_BUCKETS,
    );

    // Bytes transferred for direct uploads
    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_bytes_transferred_total",
      "Total bytes transferred via storage operations",
      4,
      { direction: "in", provider: "minio" },
    );

    // Bulkhead in-flight gauge tracking
    expect(mockMetrics.incrementGauge).toHaveBeenCalledWith(
      "bulkhead_inflight",
      "Current in-flight requests in bulkhead",
      1,
      { name: "storage" },
    );
    expect(mockMetrics.decrementGauge).toHaveBeenCalledWith(
      "bulkhead_inflight",
      "Current in-flight requests in bulkhead",
      1,
      { name: "storage" },
    );
  });

  it("records error metrics and failure status on driver error", async () => {
    mockDriverInstance.upload.mockRejectedValueOnce(new Error("S3 timeout"));

    const result = await service.upload("file.txt", Buffer.from("test"), "text/plain");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("UPLOAD_FAILED");
    }

    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_operations_total",
      "Total number of storage operations",
      1,
      { operation: "upload", provider: "minio", status: "error" },
    );

    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_errors_total",
      "Total number of storage errors",
      1,
      { error_code: "UPLOAD_FAILED", operation: "upload", provider: "minio" },
    );
  });

  it("should delete file successfully", async () => {
    const result = await service.delete("file.txt");
    expect(result.isOk()).toBe(true);

    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_operations_total",
      "Total number of storage operations",
      1,
      { operation: "delete", provider: "minio", status: "success" },
    );
  });

  it("should get presigned download url", async () => {
    const result = await service.getPresignedDownloadUrl("file.txt");
    expect(result.isOk()).toBe(true);

    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_operations_total",
      "Total number of storage operations",
      1,
      { operation: "presign_download", provider: "minio", status: "success" },
    );
  });

  it("should get presigned upload url without recording bytes", async () => {
    const result = await service.getPresignedUploadUrl("file.txt", "text/plain", 12);
    expect(result.isOk()).toBe(true);

    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_operations_total",
      "Total number of storage operations",
      1,
      { operation: "presign_upload", provider: "minio", status: "success" },
    );
    // Presigned url generation does not transfer payload bytes through the API
    expect(mockMetrics.incrementCounter).not.toHaveBeenCalledWith(
      "storage_bytes_transferred_total",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("should read stored object metadata", async () => {
    const result = await service.getMetadata("file.txt");
    expect(result.isOk() && result.value?.size).toBe(4);

    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "storage_operations_total",
      "Total number of storage operations",
      1,
      { operation: "metadata", provider: "minio", status: "success" },
    );
  });

  it("trips circuit breaker after consecutive failures and emits gauge 2 (OPEN)", async () => {
    mockDriverInstance.delete.mockRejectedValue(new Error("Connection reset"));

    for (let i = 0; i < 5; i++) {
      await service.delete("file.txt");
    }

    // Circuit breaker state gauge updated to OPEN (2)
    expect(mockMetrics.setGauge).toHaveBeenCalledWith(
      "circuit_breaker_state",
      "Circuit breaker state (0=closed, 1=half, 2=open)",
      2,
      { name: "storage" },
    );

    // Tripped counter incremented
    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "circuit_breaker_trips_total",
      "Total circuit breaker trips",
      1,
      { name: "storage" },
    );

    // Fast fail when breaker is open
    const openResult = await service.delete("file.txt");
    expect(openResult.isErr()).toBe(true);
    if (openResult.isErr()) {
      expect(openResult.error.code).toBe("CIRCUIT_OPEN");
    }
  });

  it("should delegate getPublicUrl to driver", () => {
    mockDriverInstance.getPublicUrl.mockReturnValue("https://cdn.example.com/file.txt");
    expect(service.getPublicUrl("file.txt")).toBe("https://cdn.example.com/file.txt");
    expect(mockDriverInstance.getPublicUrl).toHaveBeenCalledWith("file.txt");
  });

  it("should destroy driver on application shutdown", async () => {
    await service.onApplicationShutdown();
    expect(mockDriverInstance.destroy).toHaveBeenCalledTimes(1);
  });
});
