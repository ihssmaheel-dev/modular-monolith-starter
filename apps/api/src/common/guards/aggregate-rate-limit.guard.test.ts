import { ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { TenantContextService } from "../../infrastructure/database";
import type { I18nService } from "../../infrastructure/i18n/i18n.service";
import type { RateLimitService } from "../../infrastructure/rate-limit/rate-limit.service";
import { AggregateRateLimitGuard } from "./aggregate-rate-limit.guard";

function contextFor(request: unknown, reply: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as FastifyRequest,
      getResponse: () => reply as FastifyReply,
    }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  } as unknown as ExecutionContext;
}

describe("AggregateRateLimitGuard", () => {
  const metadata = { maxRequests: 10, windowSeconds: 60 };
  const rates = { check: vi.fn() };
  const tenants = { get: vi.fn() };
  const i18n = { t: vi.fn().mockReturnValue("Too many requests") };
  const reply = { header: vi.fn() };
  let reflector: Reflector;
  let guard: AggregateRateLimitGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    rates.check.mockResolvedValue({ allowed: true, remaining: 9, resetAt: 2_000_000_000 });
    tenants.get.mockReturnValue({ mode: "multi", tenantId: "tenant-1" });
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(metadata) } as unknown as Reflector;
    guard = new AggregateRateLimitGuard(
      reflector,
      rates as unknown as RateLimitService,
      tenants as unknown as TenantContextService,
      i18n as unknown as I18nService,
    );
  });

  it("enforces explicit limits for both actor and tenant", async () => {
    const request = {
      user: { sub: "user-1" },
      routeOptions: { url: "/api/v1/files/upload" },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(request, reply))).resolves.toBe(true);

    expect(rates.check).toHaveBeenNthCalledWith(1, "actor:user-1:route:/api/v1/files/upload", {
      ...metadata,
      failClosed: true,
    });
    expect(rates.check).toHaveBeenNthCalledWith(2, "tenant:tenant-1:route:/api/v1/files/upload", {
      ...metadata,
      failClosed: true,
    });
  });

  it("does no aggregate work without explicit route metadata", async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(undefined);

    await expect(guard.canActivate(contextFor({ headers: {} }, reply))).resolves.toBe(true);

    expect(tenants.get).not.toHaveBeenCalled();
    expect(rates.check).not.toHaveBeenCalled();
  });

  it("rejects when either aggregate is exhausted", async () => {
    rates.check
      .mockResolvedValueOnce({ allowed: true, remaining: 1, resetAt: 2_000_000_000 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 2_000_000_000 });
    const request = {
      user: { sub: "user-1" },
      routeOptions: { url: "/api/v1/files/upload" },
      headers: { "accept-language": "en" },
    };

    await expect(guard.canActivate(contextFor(request, reply))).rejects.toThrow(HttpException);

    expect(reply.header).toHaveBeenCalledWith("Retry-After", expect.any(Number));
    expect(i18n.t).toHaveBeenCalledWith("api.error.rateLimited", "en");
  });
});
