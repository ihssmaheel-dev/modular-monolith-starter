import type { MetricsService } from "../../metrics/metrics.service";

export const STORAGE_OPERATIONS = [
  "upload",
  "presign_upload",
  "presign_download",
  "delete",
  "copy",
  "metadata",
  "download_stream",
] as const;
export type StorageOperation = (typeof STORAGE_OPERATIONS)[number];

export const STORAGE_ERROR_CODES = [
  "UPLOAD_FAILED",
  "PRESIGN_FAILED",
  "NOT_FOUND",
  "DELETE_FAILED",
  "COPY_FAILED",
  "DOWNLOAD_FAILED",
  "CIRCUIT_OPEN",
  "BULKHEAD_REJECTED",
  "UNKNOWN",
] as const;
export type StorageErrorCode = (typeof STORAGE_ERROR_CODES)[number];

export const STORAGE_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

export function normalizeStorageErrorCode(code?: string): StorageErrorCode {
  if (!code) return "UNKNOWN";
  if ((STORAGE_ERROR_CODES as readonly string[]).includes(code)) {
    return code as StorageErrorCode;
  }
  return "UNKNOWN";
}

/**
 * Encapsulates all object storage Prometheus telemetry.
 *
 * Enforces strict, invariant label keys per metric name to guarantee compliance
 * with MetricsService.assertLabelNames and prevent label set mismatch crashes.
 * High-cardinality fields (tenantId, userId, bucket, key) are strictly forbidden.
 */
export class StorageMetricsRecorder {
  constructor(
    private readonly metrics: MetricsService,
    private readonly provider: string,
  ) {}

  recordOperation(operation: StorageOperation, status: "success" | "error"): void {
    this.metrics.incrementCounter(
      "storage_operations_total",
      "Total number of storage operations",
      1,
      { operation, provider: this.provider, status },
    );
  }

  recordDuration(operation: StorageOperation, durationSeconds: number): void {
    this.metrics.recordHistogram(
      "storage_operation_duration_seconds",
      "Duration of storage operations in seconds",
      durationSeconds,
      { operation, provider: this.provider },
      STORAGE_DURATION_BUCKETS,
    );
  }

  recordBytesTransferred(direction: "in" | "out", bytes: number): void {
    if (bytes <= 0) return;
    this.metrics.incrementCounter(
      "storage_bytes_transferred_total",
      "Total bytes transferred via storage operations",
      bytes,
      { direction, provider: this.provider },
    );
  }

  recordError(operation: StorageOperation, errorCode?: string): void {
    const code = normalizeStorageErrorCode(errorCode);
    this.metrics.incrementCounter("storage_errors_total", "Total number of storage errors", 1, {
      error_code: code,
      operation,
      provider: this.provider,
    });
  }

  recordCircuitBreakerState(state: "CLOSED" | "HALF_OPEN" | "OPEN"): void {
    const val = state === "CLOSED" ? 0 : state === "HALF_OPEN" ? 1 : 2;
    this.metrics.setGauge(
      "circuit_breaker_state",
      "Circuit breaker state (0=closed, 1=half, 2=open)",
      val,
      { name: "storage" },
    );
    if (state === "OPEN") {
      this.metrics.incrementCounter(
        "circuit_breaker_trips_total",
        "Total circuit breaker trips",
        1,
        { name: "storage" },
      );
    }
  }

  incrementBulkhead(): void {
    this.metrics.incrementGauge("bulkhead_inflight", "Current in-flight requests in bulkhead", 1, {
      name: "storage",
    });
  }

  decrementBulkhead(): void {
    this.metrics.decrementGauge("bulkhead_inflight", "Current in-flight requests in bulkhead", 1, {
      name: "storage",
    });
  }
}
