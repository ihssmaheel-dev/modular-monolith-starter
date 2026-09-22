import { describe, it, expect, vi, beforeEach } from "vitest";
import { TracingInterceptor } from "./tracing.interceptor";
import { resolveOtelEndpoint } from "../../tracing";
import { trace } from "@opentelemetry/api";
import type { ExecutionContext, CallHandler } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import type { FastifyReply } from "fastify";

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getActiveSpan: vi.fn(),
  },
}));

describe("Tracing Infrastructure", () => {
  describe("resolveOtelEndpoint", () => {
    it("should resolve localhost to 127.0.0.1 for IPv4 Docker compatibility", () => {
      expect(resolveOtelEndpoint("http://localhost:4318/v1/traces")).toBe(
        "http://127.0.0.1:4318/v1/traces",
      );
    });

    it("should return unchanged endpoint when already using IP or domain", () => {
      expect(resolveOtelEndpoint("http://127.0.0.1:4318/v1/traces")).toBe(
        "http://127.0.0.1:4318/v1/traces",
      );
      expect(resolveOtelEndpoint("https://tempo.prod.internal:4318/v1/traces")).toBe(
        "https://tempo.prod.internal:4318/v1/traces",
      );
    });

    it("should return undefined when endpoint is empty or undefined", () => {
      expect(resolveOtelEndpoint(undefined)).toBeUndefined();
      expect(resolveOtelEndpoint("")).toBeUndefined();
    });
  });

  describe("TracingInterceptor", () => {
    let interceptor: TracingInterceptor;
    let mockResponse: { header: ReturnType<typeof vi.fn> };
    let mockContext: ExecutionContext;
    let mockCallHandler: CallHandler;

    beforeEach(() => {
      vi.clearAllMocks();
      interceptor = new TracingInterceptor();
      mockResponse = {
        header: vi.fn(),
      };
      mockContext = {
        switchToHttp: () => ({
          getResponse: () => mockResponse as unknown as FastifyReply,
        }),
      } as unknown as ExecutionContext;
      mockCallHandler = {
        handle: () => of({ success: true }),
      };
    });

    it("should attach x-trace-id header when active span is present", async () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue({
        spanContext: () => ({
          traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
          spanId: "00f067aa0ba902b7",
          traceFlags: 1,
        }),
      } as ReturnType<typeof trace.getActiveSpan>);

      const result$ = interceptor.intercept(mockContext, mockCallHandler);
      await firstValueFrom(result$);

      expect(mockResponse.header).toHaveBeenCalledWith(
        "x-trace-id",
        "4bf92f3577b34da6a3ce929d0e0e4736",
      );
    });

    it("should proceed without setting header when no active span exists", async () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

      const result$ = interceptor.intercept(mockContext, mockCallHandler);
      await firstValueFrom(result$);

      expect(mockResponse.header).not.toHaveBeenCalled();
    });
  });
});
