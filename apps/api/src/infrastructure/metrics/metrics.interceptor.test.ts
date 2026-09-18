import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { MetricsInterceptor } from "./metrics.interceptor";
import type { MetricsService } from "./metrics.service";
import type { ExecutionContext, CallHandler } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";

describe("MetricsInterceptor", () => {
  let interceptor: MetricsInterceptor;
  let metricsService: {
    incrementGauge: ReturnType<typeof vi.fn>;
    decrementGauge: ReturnType<typeof vi.fn>;
    recordHistogram: ReturnType<typeof vi.fn>;
    incrementCounter: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    metricsService = {
      incrementGauge: vi.fn(),
      decrementGauge: vi.fn(),
      recordHistogram: vi.fn(),
      incrementCounter: vi.fn(),
    };
    interceptor = new MetricsInterceptor(metricsService as unknown as MetricsService);
  });

  function createMockContext(statusCode = 200, url = "/api/v1/notes") {
    const mockRequest = {
      method: "GET",
      routeOptions: { url },
    } as unknown as FastifyRequest;

    const mockReply = {
      statusCode,
    } as unknown as FastifyReply;

    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockReply,
      }),
    } as unknown as ExecutionContext;

    return { context, mockReply };
  }

  it("records metrics on successful request stream completion", async () => {
    const { context } = createMockContext(200);
    const handler: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe({
        complete: () => resolve(),
      });
    });

    expect(metricsService.incrementGauge).toHaveBeenCalledWith(
      "http_active_connections",
      expect.any(String),
      1,
      { method: "GET", route: "/api/v1/notes" },
    );
    expect(metricsService.decrementGauge).toHaveBeenCalledWith(
      "http_active_connections",
      expect.any(String),
      1,
      { method: "GET", route: "/api/v1/notes" },
    );
    expect(metricsService.recordHistogram).toHaveBeenCalledWith(
      "http_request_duration_seconds",
      expect.any(String),
      expect.any(Number),
      { method: "GET", route: "/api/v1/notes", status_code: 200 },
      expect.any(Array),
      undefined,
    );
    expect(metricsService.incrementCounter).toHaveBeenCalledWith(
      "http_requests_total",
      expect.any(String),
      1,
      { method: "GET", route: "/api/v1/notes", status_code: 200 },
    );
  });

  it("extracts error status code when request errors", async () => {
    const { context } = createMockContext(200);
    const handler: CallHandler = {
      handle: () => throwError(() => ({ status: 404 })),
    };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe({
        error: () => resolve(),
      });
    });

    expect(metricsService.recordHistogram).toHaveBeenCalledWith(
      "http_request_duration_seconds",
      expect.any(String),
      expect.any(Number),
      { method: "GET", route: "/api/v1/notes", status_code: 404 },
      expect.any(Array),
      undefined,
    );
  });

  it("never throws during finalize even if metric recording fails", async () => {
    const { context } = createMockContext(200);
    metricsService.recordHistogram.mockImplementation(() => {
      throw new Error("prom-client unexpected failure");
    });

    const handler: CallHandler = {
      handle: () => of({ ok: true }),
    };

    let completed = false;
    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, handler).subscribe({
        next: () => {
          completed = true;
        },
        complete: () => resolve(),
        error: (err) => reject(err),
      });
    });

    expect(completed).toBe(true);
  });

  it("never throws if incrementGauge throws, and proceeds with request execution", async () => {
    const { context } = createMockContext(200);
    metricsService.incrementGauge.mockImplementation(() => {
      throw new Error("Gauge registry connection failure");
    });

    const handler: CallHandler = {
      handle: () => of({ success: true }),
    };

    let result: unknown;
    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, handler).subscribe({
        next: (val) => {
          result = val;
        },
        complete: () => resolve(),
        error: (err) => reject(err),
      });
    });

    expect(result).toEqual({ success: true });
    // Gauge decrement should be safely skipped since increment failed
    expect(metricsService.decrementGauge).not.toHaveBeenCalled();
    // Histogram and counter still record the request
    expect(metricsService.incrementCounter).toHaveBeenCalled();
  });

  it("marks request as telemetryRecorded upon completion", async () => {
    const { context } = createMockContext(200);
    const req = context.switchToHttp().getRequest() as Record<string, unknown>;

    const handler: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe({
        complete: () => resolve(),
      });
    });

    expect(req.telemetryRecorded).toBe(true);
  });
});
