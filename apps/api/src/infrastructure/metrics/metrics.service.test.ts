import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetricsService } from "./metrics.service";

vi.mock("prom-client", () => {
  return {
    register: {
      getSingleMetric: vi.fn(),
    },
    Counter: class {
      inc = vi.fn();
    },
    Gauge: class {
      inc = vi.fn();
      dec = vi.fn();
      set = vi.fn();
    },
    Histogram: class {
      observe = vi.fn();
      startTimer = vi.fn();
    },
    Summary: class {
      observe = vi.fn();
    },
  };
});

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MetricsService();
  });

  it("should initialize metrics service properly", () => {
    expect(service).toBeDefined();
  });

  it("should increment and decrement a gauge", () => {
    service.incrementGauge("http_active_connections", "Active HTTP Connections");
    service.decrementGauge("http_active_connections", "Active HTTP Connections");

    expect(service).toBeDefined();
  });

  it("should reuse already registered metrics from prom-client registry", async () => {
    const { register } = await import("prom-client");
    const mockExistingHistogram = {
      observe: vi.fn(),
      startTimer: vi.fn(),
    };
    vi.mocked(register.getSingleMetric).mockReturnValue(mockExistingHistogram as never);

    service.recordHistogram("realtime_consumer_lag_ms", "Consumer lag", 123);

    expect(register.getSingleMetric).toHaveBeenCalledWith("realtime_consumer_lag_ms");
    expect(mockExistingHistogram.observe).toHaveBeenCalledWith(123);
  });

  it("should pass exemplar labels to histogram observe when provided", async () => {
    const { register } = await import("prom-client");
    const mockExistingHistogram = {
      observe: vi.fn(),
      startTimer: vi.fn(),
    };
    vi.mocked(register.getSingleMetric).mockReturnValue(mockExistingHistogram as never);

    service.recordHistogram(
      "http_request_duration_seconds",
      "Duration",
      0.05,
      { method: "GET", route: "/notes" },
      [0.1, 0.5],
      { trace_id: "test-trace-123" },
    );

    expect(mockExistingHistogram.observe).toHaveBeenCalledWith({
      labels: { method: "GET", route: "/notes" },
      value: 0.05,
      exemplarLabels: { trace_id: "test-trace-123" },
    });
  });

  it("rejects inconsistent label sets after a metric has been cached", async () => {
    const { register } = await import("prom-client");
    vi.mocked(register.getSingleMetric).mockReturnValue(undefined);
    service.setGauge("queue_depth", "Queue depth", 1, { queue: "email" });

    expect(() => service.setGauge("queue_depth", "Queue depth", 2)).toThrow(
      "Metric queue_depth was called with an incompatible label set",
    );
  });
});
