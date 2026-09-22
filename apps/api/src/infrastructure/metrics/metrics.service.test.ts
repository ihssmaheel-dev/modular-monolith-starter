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
      type: "histogram",
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
      type: "histogram",
      observe: vi.fn(),
      startTimer: vi.fn(),
      enableExemplars: true,
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

  it("should discard exemplar labels when histogram does not support exemplars", async () => {
    const { register } = await import("prom-client");
    const mockNonExemplarHistogram = {
      type: "histogram",
      observe: vi.fn(),
      startTimer: vi.fn(),
      enableExemplars: false,
    };
    vi.mocked(register.getSingleMetric).mockReturnValue(mockNonExemplarHistogram as never);

    service.recordHistogram(
      "http_request_duration_seconds",
      "Duration",
      0.05,
      { method: "GET", route: "/notes" },
      [0.1, 0.5],
      { trace_id: "test-trace-123" },
    );

    expect(mockNonExemplarHistogram.observe).toHaveBeenCalledWith(
      { method: "GET", route: "/notes" },
      0.05,
    );
  });

  it("rejects inconsistent label sets after a metric has been cached", async () => {
    const { register } = await import("prom-client");
    vi.mocked(register.getSingleMetric).mockReturnValue(undefined);
    service.setGauge("queue_depth", "Queue depth", 1, { queue: "email" });

    expect(() => service.setGauge("queue_depth", "Queue depth", 2)).toThrow(
      "Metric queue_depth was called with an incompatible label set",
    );
  });

  it("should observe histogram with object payload when enableExemplars is true even without exemplarLabels", async () => {
    const { register } = await import("prom-client");
    const mockExemplarHistogram = {
      type: "histogram",
      observe: vi.fn(),
      startTimer: vi.fn(),
      enableExemplars: true,
    };
    vi.mocked(register.getSingleMetric).mockReturnValue(mockExemplarHistogram as never);

    service.recordHistogram("http_request_duration_seconds", "Duration", 0.12, {
      method: "GET",
      route: "/api/health",
    });

    expect(mockExemplarHistogram.observe).toHaveBeenCalledWith({
      labels: { method: "GET", route: "/api/health" },
      value: 0.12,
    });
  });

  it("should sanitize non-finite values when recording metrics", async () => {
    const { register } = await import("prom-client");
    const mockHistogram = {
      type: "histogram",
      observe: vi.fn(),
      startTimer: vi.fn(),
    };
    vi.mocked(register.getSingleMetric).mockReturnValue(mockHistogram as never);

    service.recordHistogram("bad_num_metric", "Bad", Number.NaN);

    expect(mockHistogram.observe).toHaveBeenCalledWith(0);
  });

  it("rejects metric reuse when the registered metric has an incompatible type", async () => {
    const { register } = await import("prom-client");
    const mockCounter = {
      type: "counter",
      inc: vi.fn(),
    };
    vi.mocked(register.getSingleMetric).mockReturnValue(mockCounter as never);

    expect(() => {
      service.recordHistogram("conflict_metric", "Should be histogram", 10);
    }).toThrow("Metric conflict_metric is registered but is not a Histogram");
  });

  it("creates histogram cleanly when buckets are undefined", async () => {
    const { register } = await import("prom-client");
    vi.mocked(register.getSingleMetric).mockReturnValue(undefined);

    expect(() => {
      service.recordHistogram("unbucketed_histogram", "No buckets passed", 42);
    }).not.toThrow();
  });

  it("distinguishes an empty label signature from missing metadata", () => {
    service.setGauge("unlabelled_metric", "Unlabelled", 1);

    expect(() =>
      service.setGauge("unlabelled_metric", "Unlabelled", 2, { service: "api" }),
    ).toThrow("Metric unlabelled_metric was called with an incompatible label set");
  });

  it("rejects using one metric name for two metric types", () => {
    service.setGauge("metric_kind_conflict", "Gauge", 1);

    expect(() => service.incrementCounter("metric_kind_conflict", "Counter", 1)).toThrow(
      "Metric metric_kind_conflict was called with incompatible types",
    );
  });
});
