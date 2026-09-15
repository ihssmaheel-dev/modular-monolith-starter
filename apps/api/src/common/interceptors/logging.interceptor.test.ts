import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { LoggingInterceptor } from "./logging.interceptor";
import type { ExecutionContext, CallHandler } from "@nestjs/common";
import type { PinoLoggerService } from "../../infrastructure/logger/logger.service";

describe("LoggingInterceptor", () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    interceptor = new LoggingInterceptor(mockLogger as unknown as PinoLoggerService);
  });

  function createMockContext(
    url: string,
    method = "GET",
    statusCode = 200,
    routeUrl?: string,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ url, method, routeOptions: routeUrl ? { url: routeUrl } : undefined }),
        getResponse: () => ({ statusCode }),
      }),
    } as unknown as ExecutionContext;
  }

  it("should log normal requests at info level with formatted message", async () => {
    const context = createMockContext("/api/v1/rpc/notes", "GET", 200);
    const next: CallHandler = { handle: () => of({ success: true }) };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, next).subscribe({
        complete: () => {
          expect(mockLogger.info).toHaveBeenCalledTimes(1);
          const call = mockLogger.info.mock.calls[0];
          expect(call).toBeDefined();
          if (!call) return;
          const [data, message] = call;
          expect((data as { method: string }).method).toBe("GET");
          expect((data as { route: string }).route).toBe("/api/v1/rpc/notes");
          expect((data as { statusCode: number }).statusCode).toBe(200);
          expect(message).toMatch(/GET \/api\/v1\/rpc\/notes 200 - \d+ms/);
          expect(mockLogger.debug).not.toHaveBeenCalled();
          resolve();
        },
      });
    });
  });

  it("should log /metrics and /health at debug level instead of info", async () => {
    const context = createMockContext("/metrics", "GET", 200);
    const next: CallHandler = { handle: () => of("metrics-data") };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, next).subscribe({
        complete: () => {
          expect(mockLogger.info).not.toHaveBeenCalled();
          expect(mockLogger.debug).toHaveBeenCalledTimes(1);
          const call = mockLogger.debug.mock.calls[0];
          expect(call).toBeDefined();
          if (!call) return;
          const [data, message] = call;
          expect((data as { route: string }).route).toBe("/metrics");
          expect(message).toMatch(/GET \/metrics 200 - \d+ms/);
          resolve();
        },
      });
    });
  });

  it("keeps versioned health-probe traffic at debug level", async () => {
    const context = createMockContext("/api/v1/health/ready", "GET", 200);
    const next: CallHandler = { handle: () => of({ status: "ok" }) };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, next).subscribe({
        complete: () => {
          expect(mockLogger.info).not.toHaveBeenCalled();
          expect(mockLogger.debug).toHaveBeenCalledTimes(1);
          resolve();
        },
      });
    });
  });

  it("does not log query strings or concrete route parameters", async () => {
    const context = createMockContext(
      "/api/v1/users/user-secret?token=secret-value",
      "GET",
      200,
      "/api/v1/users/:id",
    );
    const next: CallHandler = { handle: () => of({ success: true }) };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, next).subscribe({
        complete: () => {
          const serialized = JSON.stringify(mockLogger.info.mock.calls[0]);
          expect(serialized).toContain("/api/v1/users/:id");
          expect(serialized).not.toContain("user-secret");
          expect(serialized).not.toContain("secret-value");
          resolve();
        },
      });
    });
  });

  it("should log failed requests at warn level with extracted error status", async () => {
    const context = createMockContext("/api/v1/rpc/auth/login", "POST", 200);
    const error = { status: 401, message: "Unauthorized" };
    const next: CallHandler = { handle: () => throwError(() => error) };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, next).subscribe({
        error: (err) => {
          expect(err).toBe(error);
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);
          const call = mockLogger.warn.mock.calls[0];
          expect(call).toBeDefined();
          if (!call) return;
          const [data, message] = call;
          expect((data as { method: string }).method).toBe("POST");
          expect((data as { statusCode: number }).statusCode).toBe(401);
          expect(message).toMatch(/POST \/api\/v1\/rpc\/auth\/login 401 - \d+ms \(failed\)/);
          resolve();
        },
      });
    });
  });
});
