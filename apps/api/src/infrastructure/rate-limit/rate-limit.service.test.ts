import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimitService } from "./rate-limit.service";

const mockEval = vi.fn();

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
  },
}));

describe("RateLimitService", () => {
  let service: RateLimitService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEval.mockResolvedValue(5);

    const mockMetrics = { incrementCounter: vi.fn() } as never;
    const mockLogger = { child: vi.fn().mockReturnThis(), warn: vi.fn(), error: vi.fn() } as never;
    service = new RateLimitService(
      {
        getClient: () => ({
          eval: mockEval,
        }),
      } as never,
      mockMetrics,
      mockLogger,
    );
  });

  it("should allow request within limit", async () => {
    const result = await service.check("test-key", { maxRequests: 100, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(95);
  });

  it("should check by IP", async () => {
    const result = await service.checkByIp("127.0.0.1");
    expect(result.allowed).toBe(true);
  });

  it("should check by tenant", async () => {
    const result = await service.checkByTenant("tenant1");
    expect(result.allowed).toBe(true);
  });

  it("should check by route", async () => {
    const result = await service.checkByRoute("/api/v1/users");
    expect(result.allowed).toBe(true);
  });

  it("bounds the sliding-window log size (H25)", async () => {
    await service.check("ip:1.2.3.4:route:/notes", { maxRequests: 100, windowSeconds: 60 });

    const args = mockEval.mock.calls[0]!;
    expect(args[0]).toContain("ZREMRANGEBYRANK");
    // keep = maxRequests + headroom
    expect(args[7]).toBe("200");
  });

  it("uses bounded metric labels without client identities when Redis is down", async () => {
    const mockMetrics = {
      incrementCounter: vi.fn(),
    } as unknown as import("../metrics/metrics.service").MetricsService;
    const mockLogger = { child: vi.fn().mockReturnThis(), warn: vi.fn(), error: vi.fn() } as never;
    const down = new RateLimitService({ getClient: () => null } as never, mockMetrics, mockLogger);

    const result = await down.check("ip:9.9.9.9:route:/api/v1/auth/login");

    expect(result.allowed).toBe(false);
    expect(vi.mocked(mockMetrics.incrementCounter)).toHaveBeenCalledWith(
      "rate_limit_redis_unavailable",
      expect.any(String),
      1,
      { scope: "auth", route: "/api/v1/auth/login" },
    );
  });
});
