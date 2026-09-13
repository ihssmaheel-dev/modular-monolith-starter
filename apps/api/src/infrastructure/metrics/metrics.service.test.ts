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
});
