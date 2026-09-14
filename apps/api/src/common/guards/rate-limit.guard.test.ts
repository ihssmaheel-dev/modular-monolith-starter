import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimitGuard } from "./rate-limit.guard";
import type { RateLimitService } from "../../infrastructure/rate-limit/rate-limit.service";
import type { I18nService } from "../../infrastructure/i18n/i18n.service";
import type { MetricsService } from "../../infrastructure/metrics/metrics.service";
import type { FastifyReply, FastifyRequest } from "fastify";

function createMockContext(req: unknown, res: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req as FastifyRequest,
      getResponse: () => res as FastifyReply,
    }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  } as unknown as ExecutionContext;
}

describe("RateLimitGuard", () => {
  let reflector: Reflector;
  let rateLimitService: { check: ReturnType<typeof vi.fn> };
  let i18n: { t: ReturnType<typeof vi.fn> };
  let metrics: { incrementCounter: ReturnType<typeof vi.fn> };
  let guard: RateLimitGuard;
  let mockRes: { header: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(null),
    } as unknown as Reflector;

    rateLimitService = {
      check: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetAt: 1700000060,
      }),
    };

    i18n = {
      t: vi.fn().mockReturnValue("Too many requests"),
    };

    metrics = {
      incrementCounter: vi.fn(),
    };

    mockRes = {
      header: vi.fn(),
    };

    guard = new RateLimitGuard(
      reflector,
      rateLimitService as unknown as RateLimitService,
      i18n as unknown as I18nService,
      metrics as unknown as MetricsService,
    );
  });

  it("allows requests within rate limits and sets response headers", async () => {
    const mockReq = {
      ip: "127.0.0.1",
      routeOptions: { url: "/api/v1/notes" },
      headers: {},
    };
    const context = createMockContext(mockReq, mockRes);

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(mockRes.header).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
    expect(mockRes.header).toHaveBeenCalledWith("X-RateLimit-Remaining", "99");
    expect(mockRes.header).toHaveBeenCalledWith("X-RateLimit-Reset", "1700000060");
    expect(metrics.incrementCounter).not.toHaveBeenCalled();
  });

  it("throws 429 and emits rate_limit_exceeded_total metric when limit exceeded", async () => {
    rateLimitService.check.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 1700000060,
    });

    const mockReq = {
      ip: "10.0.0.1",
      routeOptions: { url: "/api/v1/notes" },
      headers: { "accept-language": "en" },
    };
    const context = createMockContext(mockReq, mockRes);

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

    expect(mockRes.header).toHaveBeenCalledWith("X-RateLimit-Remaining", "0");
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      "rate_limit_exceeded_total",
      "Total number of rate limit rejections",
      1,
      { scope: "api", route: "/api/v1/notes" },
    );
  });

  it("labels auth-scoped rate limit rejections correctly", async () => {
    rateLimitService.check.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 1700000060,
    });

    const mockReq = {
      ip: "10.0.0.2",
      routeOptions: { url: "/api/v1/auth/login" },
      headers: {},
    };
    const context = createMockContext(mockReq, mockRes);

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      "rate_limit_exceeded_total",
      "Total number of rate limit rejections",
      1,
      { scope: "auth", route: "/api/v1/auth/login" },
    );
  });

  it("handles optional metrics service gracefully when absent", async () => {
    const guardWithoutMetrics = new RateLimitGuard(
      reflector,
      rateLimitService as unknown as RateLimitService,
      i18n as unknown as I18nService,
      undefined,
    );

    rateLimitService.check.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 1700000060,
    });

    const mockReq = {
      ip: "10.0.0.3",
      routeOptions: { url: "/api/v1/files" },
      headers: {},
    };
    const context = createMockContext(mockReq, mockRes);

    await expect(guardWithoutMetrics.canActivate(context)).rejects.toThrow(HttpException);
  });

  it("respects custom rate limit decorator metadata", async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue({
      maxRequests: 5,
      windowSeconds: 30,
    });

    const mockReq = {
      ip: "127.0.0.1",
      routeOptions: { url: "/api/v1/auth/forgot-password" },
      headers: {},
    };
    const context = createMockContext(mockReq, mockRes);

    await guard.canActivate(context);

    expect(rateLimitService.check).toHaveBeenCalledWith(
      "ip:127.0.0.1:route:/api/v1/auth/forgot-password",
      { windowSeconds: 30, maxRequests: 5 },
    );
    expect(mockRes.header).toHaveBeenCalledWith("X-RateLimit-Limit", "5");
  });
});
