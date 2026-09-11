import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { firstValueFrom, of, throwError } from "rxjs";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";

interface RedisMock {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
}

describe("IdempotencyInterceptor", () => {
  let interceptor: IdempotencyInterceptor;
  let reflector: Reflector;
  let redisService: RedisService;
  let cls: ClsService;
  let redisClient: RedisMock;

  beforeEach(() => {
    reflector = new Reflector();
    redisClient = { set: vi.fn(), get: vi.fn(), eval: vi.fn().mockResolvedValue(1) };
    redisService = { getClient: vi.fn().mockReturnValue(redisClient) } as unknown as RedisService;
    cls = {
      get: vi.fn((key: string) => (key === "userId" ? "user-123" : undefined)),
    } as unknown as ClsService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    interceptor = new IdempotencyInterceptor(reflector, redisService, cls, logger);
  });

  const createContext = (
    headers: Record<string, string> = {},
    body: unknown = { title: "hello" },
    method = "POST",
    route = "/notes",
  ) =>
    ({
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          headers,
          body,
          method,
          url: route,
          routeOptions: { url: route },
          ip: "127.0.0.1",
        }),
      }),
    }) as unknown as ExecutionContext;

  const handler = (value: unknown = "success", failed = false): CallHandler => ({
    handle: vi
      .fn()
      .mockReturnValue(failed ? throwError(() => new Error("Handler error")) : of(value)),
  });

  it("bypasses endpoints without @Idempotent", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const next = handler();
    const result = await interceptor.intercept(createContext(), next);
    await expect(firstValueFrom(result)).resolves.toBe("success");
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("requires a valid idempotency key", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    await expect(interceptor.intercept(createContext(), handler())).rejects.toThrow(
      BadRequestException,
    );
  });

  it("fails closed in production when Redis is unavailable", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    vi.spyOn(redisService, "getClient").mockReturnValue(null);
    const next = handler();
    const result = await interceptor.intercept(createContext({ "idempotency-key": "req-1" }), next);
    await expect(firstValueFrom(result)).resolves.toBe("success");
  });

  it("binds the lock to method, route, and a deterministic request fingerprint", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    redisClient.set.mockResolvedValueOnce("OK");
    const next = handler({ data: "success" });
    const result = await interceptor.intercept(
      createContext({ "idempotency-key": "req-1" }, { b: 2, a: 1 }),
      next,
    );
    await expect(firstValueFrom(result)).resolves.toEqual({ data: "success" });
    const [key, raw, mode, processingTtl, nx] = redisClient.set.mock.calls[0]!;
    expect(key).toContain("idempotency:v2:single:user-123:req-1");
    expect(mode).toBe("EX");
    expect(processingTtl).toBeGreaterThan(0);
    expect(nx).toBe("NX");
    expect(JSON.parse(raw as string)).toMatchObject({
      state: "processing",
      fingerprint: expect.any(String),
      method: "POST",
      route: "/notes",
      bodyHash: expect.any(String),
    });
    expect(redisClient.eval).toHaveBeenCalled();
  });

  it("rejects reuse of a key with a different request fingerprint", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    redisClient.set.mockResolvedValueOnce(null);
    redisClient.get.mockResolvedValueOnce(
      JSON.stringify({
        state: "completed",
        fingerprint: "different",
        method: "POST",
        route: "/notes",
        bodyHash: "different",
        body: {},
        bodyBytes: 2,
        completedAt: Date.now(),
      }),
    );
    await expect(
      interceptor.intercept(createContext({ "idempotency-key": "req-1" }), handler()),
    ).rejects.toThrow(ConflictException);
  });

  it("replays a completed response without invoking the handler", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    const request = createContext({ "idempotency-key": "req-1" });
    redisClient.set.mockResolvedValueOnce("OK");
    await firstValueFrom(await interceptor.intercept(request, handler({ data: "cached" })));
    const finalized = redisClient.eval.mock.calls[0]!;
    const completed = JSON.parse(finalized[4] as string) as Record<string, unknown>;
    redisClient.get.mockReset();
    redisClient.set.mockReset();
    redisClient.set.mockResolvedValueOnce(null);
    redisClient.get.mockResolvedValueOnce(JSON.stringify(completed));
    const next = handler();
    const result = await interceptor.intercept(request, next);
    await expect(firstValueFrom(result)).resolves.toEqual({ data: "cached" });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it("recovers a stale processing record atomically", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    const request = createContext({ "idempotency-key": "req-1" });
    redisClient.set.mockResolvedValueOnce("OK");
    await firstValueFrom(await interceptor.intercept(request, handler({ ok: true })));
    const fingerprint = redisClient.eval.mock.calls[0]![3] as string;
    const completed = JSON.parse(redisClient.eval.mock.calls[0]![4] as string) as {
      bodyHash: string;
      path: string;
      queryHash: string;
    };
    redisClient.set.mockReset();
    redisClient.get.mockReset();
    redisClient.eval.mockReset().mockResolvedValue(1);
    redisClient.set.mockResolvedValueOnce(null);
    redisClient.get.mockResolvedValueOnce(
      JSON.stringify({
        state: "processing",
        fingerprint,
        method: "POST",
        route: "/notes",
        path: "/notes",
        queryHash: completed.queryHash,
        bodyHash: completed.bodyHash,
        startedAt: Date.now() - 120_000,
      }),
    );
    const next = handler({ ok: true });
    const result = await interceptor.intercept(request, next);
    await expect(firstValueFrom(result)).resolves.toEqual({ ok: true });
    expect(next.handle).toHaveBeenCalled();
  });

  it("allows only one concurrent request to own a key", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    let processingRecord: string | null = null;
    redisClient.set.mockImplementation(async (_key: string, value: string) => {
      if (processingRecord) return null;
      processingRecord = value;
      return "OK";
    });
    redisClient.get.mockImplementation(async () => processingRecord);
    const request = createContext({ "idempotency-key": "concurrent-1" });
    const first = await interceptor.intercept(request, handler({ ok: true }));
    await expect(interceptor.intercept(request, handler({ ok: false }))).rejects.toThrow(
      ConflictException,
    );
    await expect(firstValueFrom(first)).resolves.toEqual({ ok: true });
  });

  it("releases only its own lock when the handler fails", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    redisClient.set.mockResolvedValueOnce("OK");
    const result = await interceptor.intercept(
      createContext({ "idempotency-key": "req-1" }),
      handler(null, true),
    );
    await expect(firstValueFrom(result)).rejects.toThrow("Handler error");
    expect(redisClient.eval).toHaveBeenCalled();
  });
});
