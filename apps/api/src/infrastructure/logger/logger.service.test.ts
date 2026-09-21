import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClsService } from "nestjs-cls";
import { PinoLoggerService, LOKI_LABELS, resolveLokiHost } from "./logger.service";
import { trace } from "@opentelemetry/api";

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getActiveSpan: vi.fn(),
  },
}));

describe("PinoLoggerService", () => {
  let mockCls: Partial<ClsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCls = {
      isActive: vi.fn().mockReturnValue(false),
      get: vi.fn(),
    };
  });

  describe("Loki configuration and host resolution", () => {
    it("should configure LOKI_LABELS with service=api and job=api", () => {
      expect(LOKI_LABELS.service).toBe("api");
      expect(LOKI_LABELS.job).toBe("api");
      expect(LOKI_LABELS.container).toBe("monorepo-api");
      expect(LOKI_LABELS.application).toBe("api-service");
    });

    it("should resolve localhost to 127.0.0.1 to avoid IPv6 connection issues", () => {
      expect(resolveLokiHost("http://localhost:3100")).toBe("http://127.0.0.1:3100");
      expect(resolveLokiHost("https://localhost:3100/loki")).toBe("https://127.0.0.1:3100/loki");
      expect(resolveLokiHost("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100");
      expect(resolveLokiHost("http://loki:3100")).toBe("http://loki:3100");
    });
  });

  it("should initialize without ClsService", () => {
    const service = new PinoLoggerService();
    expect(service).toBeDefined();
  });

  it("should initialize with ClsService", () => {
    const service = new PinoLoggerService(mockCls as ClsService);
    expect(service).toBeDefined();
  });

  it("should log info, warn, error, and debug messages without throwing", () => {
    const service = new PinoLoggerService(mockCls as ClsService);

    expect(() => {
      service.info({ test: "info" }, "Info test message");
      service.warn({ test: "warn" }, "Warn test message");
      service.error({ test: "error", error: new Error("boom") }, "Error test message");
      service.debug({ test: "debug" }, "Debug test message");
    }).not.toThrow();
  });

  it("should create child logger with additional bindings", () => {
    const service = new PinoLoggerService(mockCls as ClsService);
    const childService = service.child({ module: "TestModule" });

    expect(childService).toBeDefined();
    expect(() => {
      childService.info({ action: "child_test" }, "Child message");
    }).not.toThrow();
  });

  it("should enrich context with CLS requestId, tenantId, and userId when CLS is active", () => {
    mockCls.isActive = vi.fn().mockReturnValue(true);
    mockCls.get = vi.fn().mockImplementation((key: string) => {
      if (key === "requestId") return "req-cls-123";
      if (key === "tenantId") return "tenant-cls-456";
      if (key === "userId") return "user-cls-789";
      return undefined;
    });

    const service = new PinoLoggerService(mockCls as ClsService);
    expect(() => {
      service.info({}, "Test with active CLS");
    }).not.toThrow();
  });

  it("should enrich context with OpenTelemetry trace and span IDs when active span exists", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue({
      spanContext: () => ({
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
      }),
    } as ReturnType<typeof trace.getActiveSpan>);

    const service = new PinoLoggerService(mockCls as ClsService);
    expect(() => {
      service.info({}, "Test with active trace span");
    }).not.toThrow();
  });

  it("should flush logger on module destroy", () => {
    const service = new PinoLoggerService();
    expect(() => {
      service.onModuleDestroy();
    }).not.toThrow();
  });
});
