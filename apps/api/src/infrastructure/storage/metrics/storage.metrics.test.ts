import { describe, expect, it, vi, beforeEach } from "vitest";
import { StorageMetricsRecorder } from "./storage.metrics";
import type { MetricsService } from "../../metrics/metrics.service";

describe("StorageMetricsRecorder", () => {
  let recorder: StorageMetricsRecorder;
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = {
      incrementCounter: vi.fn(),
      recordHistogram: vi.fn(),
      setGauge: vi.fn(),
      incrementGauge: vi.fn(),
      decrementGauge: vi.fn(),
    } as unknown as MetricsService;

    recorder = new StorageMetricsRecorder(metricsService, "s3");
  });

  it("records successful operation metrics", () => {
    recorder.recordOperation("upload", "success");
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "storage_operations_total",
      expect.any(String),
      1,
      { operation: "upload", provider: "s3", status: "success" },
    );
  });

  it("records operation duration with standard buckets", () => {
    recorder.recordDuration("upload", 0.42);
    expect(metricsService.recordHistogram).toHaveBeenCalledWith(
      "storage_operation_duration_seconds",
      expect.any(String),
      0.42,
      { operation: "upload", provider: "s3" },
      expect.any(Array),
    );
  });

  it("records bytes transferred for positive amounts", () => {
    recorder.recordBytesTransferred("in", 1024);
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "storage_bytes_transferred_total",
      expect.any(String),
      1024,
      { direction: "in", provider: "s3" },
    );
  });

  it("ignores non-positive bytes transferred", () => {
    recorder.recordBytesTransferred("in", 0);
    recorder.recordBytesTransferred("out", -50);
    expect(metricsService.incrementCounter).not.toHaveBeenCalled();
  });

  it("normalizes unknown error codes", () => {
    recorder.recordError("upload", "RANDOM_ERROR");
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "storage_errors_total",
      expect.any(String),
      1,
      { error_code: "UNKNOWN", operation: "upload", provider: "s3" },
    );
  });

  it("records known error codes correctly", () => {
    recorder.recordError("upload", "CIRCUIT_OPEN");
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "storage_errors_total",
      expect.any(String),
      1,
      { error_code: "CIRCUIT_OPEN", operation: "upload", provider: "s3" },
    );
  });

  it("records circuit breaker state transitions", () => {
    recorder.recordCircuitBreakerState("OPEN");
    expect(metricsService.setGauge).toHaveBeenCalledWith(
      "circuit_breaker_state",
      expect.any(String),
      2,
      { name: "storage" },
    );
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "circuit_breaker_trips_total",
      expect.any(String),
      1,
      { name: "storage" },
    );
  });

  it("increments and decrements bulkhead inflight gauge", () => {
    recorder.incrementBulkhead();
    expect(metricsService.incrementGauge).toHaveBeenCalledWith(
      "bulkhead_inflight",
      expect.any(String),
      1,
      { name: "storage" },
    );

    recorder.decrementBulkhead();
    expect(metricsService.decrementGauge).toHaveBeenCalledWith(
      "bulkhead_inflight",
      expect.any(String),
      1,
      { name: "storage" },
    );
  });

  it("never throws if metrics service throws an error during recording", () => {
    vi.mocked(metricsService.incrementCounter).mockImplementation(() => {
      throw new Error("Prometheus registry failure");
    });
    vi.mocked(metricsService.recordHistogram).mockImplementation(() => {
      throw new Error("Histogram observe error");
    });
    vi.mocked(metricsService.setGauge).mockImplementation(() => {
      throw new Error("Gauge set error");
    });
    vi.mocked(metricsService.incrementGauge).mockImplementation(() => {
      throw new Error("Gauge inc error");
    });
    vi.mocked(metricsService.decrementGauge).mockImplementation(() => {
      throw new Error("Gauge dec error");
    });

    expect(() => recorder.recordOperation("upload", "error")).not.toThrow();
    expect(() => recorder.recordDuration("upload", 1.5)).not.toThrow();
    expect(() => recorder.recordBytesTransferred("in", 5000)).not.toThrow();
    expect(() => recorder.recordError("upload", "UPLOAD_FAILED")).not.toThrow();
    expect(() => recorder.recordCircuitBreakerState("OPEN")).not.toThrow();
    expect(() => recorder.incrementBulkhead()).not.toThrow();
    expect(() => recorder.decrementBulkhead()).not.toThrow();
  });
});
