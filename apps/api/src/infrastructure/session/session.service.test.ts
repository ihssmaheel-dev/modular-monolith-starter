import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionService } from "./session.service";
import type { RedisService } from "../redis/redis.service";
import type { PinoLoggerService } from "../logger/logger.service";

const mockSetex = vi.fn();
const mockGet = vi.fn();
const mockDel = vi.fn();
const mockSadd = vi.fn();
const mockSrem = vi.fn();
const mockSmembers = vi.fn();
const mockEval = vi.fn();

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
    JWT_REFRESH_EXPIRES_IN: "7d",
  },
}));

describe("SessionService", () => {
  let service: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    mockLogger.child = () => mockLogger;

    service = new SessionService(
      {
        getClient: () => ({
          setex: mockSetex,
          get: mockGet,
          sadd: mockSadd,
          del: mockDel,
          srem: mockSrem,
          smembers: mockSmembers,
          eval: mockEval,
          pipeline: () => ({
            del: mockDel,
            setex: mockSetex,
            exec: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as RedisService,
      mockLogger,
    );
  });

  it("should create a session", async () => {
    mockSetex.mockResolvedValue("OK");
    mockSadd.mockResolvedValue(1);

    const session = await service.create({
      userId: "user1",
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      deviceName: "Chrome",
    });

    expect(session.userId).toBe("user1");
    expect(session.ip).toBe("127.0.0.1");
    expect(session.deviceName).toBe("Chrome");
    expect(mockSetex).toHaveBeenCalled();
    expect(mockSadd).toHaveBeenCalled();
  });

  it("should get session by id", async () => {
    const sessionData = {
      id: "abc123",
      userId: "user1",
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      deviceName: "Chrome",
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    mockGet.mockResolvedValue(JSON.stringify(sessionData));

    const result = await service.getById("abc123");
    expect(result).toEqual(sessionData);
  });

  it("should return null for non-existent session", async () => {
    mockGet.mockResolvedValue(null);
    const result = await service.getById("nonexistent");
    expect(result).toBeNull();
  });

  it("should revoke a session", async () => {
    const sessionData = {
      id: "abc123",
      userId: "user1",
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      deviceName: "Chrome",
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    mockGet.mockResolvedValue(JSON.stringify(sessionData));
    mockDel.mockResolvedValue(1);
    mockSrem.mockResolvedValue(1);
    mockSetex.mockResolvedValue("OK");

    await service.revoke("abc123");
    expect(mockDel).toHaveBeenCalled();
    expect(mockSrem).toHaveBeenCalled();
  });

  it("should revoke all sessions for a user", async () => {
    mockSmembers.mockResolvedValue(["sess1", "sess2"]);
    mockGet
      .mockResolvedValueOnce(JSON.stringify({ id: "sess1", userId: "user1" }))
      .mockResolvedValueOnce(JSON.stringify({ id: "sess2", userId: "user1" }));
    mockDel.mockResolvedValue(1);
    mockSetex.mockResolvedValue("OK");

    await service.revokeAllForUser("user1");
    expect(mockSmembers).toHaveBeenCalledWith("user:user1:sessions");
  });

  it("rotates a session refresh chain atomically", async () => {
    mockEval.mockResolvedValue("rotated");

    const result = await service.rotateSessionRefresh("user1", "sess1", "jti-old", "jti-new");

    expect(result).toBe("rotated");
    const [script, keyCount, familyKey, usedKey, presented, next, ttl] = mockEval.mock.calls[0]!;
    expect(script).toContain("EXISTS");
    expect(script).toContain("reused");
    expect(keyCount).toBe(2);
    expect(familyKey).toBe("auth:refresh:family:user1:sess1");
    expect(usedKey).toBe("auth:refresh:used:user1:sess1:jti-old");
    expect(presented).toBe("jti-old");
    expect(next).toBe("jti-new");
    expect(ttl).toBe(String(7 * 24 * 60 * 60));
  });

  it("reports reuse when the presented token was superseded", async () => {
    mockEval.mockResolvedValue("reused");

    const result = await service.rotateSessionRefresh("user1", "sess1", "jti-old", "jti-new");

    expect(result).toBe("reused");
  });

  it("fails closed when Redis is unavailable", async () => {
    const offline = new SessionService(
      { getClient: () => null } as unknown as RedisService,
      {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
      } as unknown as PinoLoggerService,
    );

    await expect(
      offline.rotateSessionRefresh("user1", "sess1", "jti-old", "jti-new"),
    ).resolves.toBe("unavailable");
    await expect(offline.getRefreshSession("sess1")).resolves.toBeNull();
  });

  it("loads a refresh session only when present and unrevoked", async () => {
    const sessionData = {
      id: "sess1",
      userId: "user1",
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      deviceName: "Chrome",
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    mockGet.mockReset();
    mockGet
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(sessionData));

    // First call: revocation marker present.
    await expect(service.getRefreshSession("sess1")).resolves.toBeNull();
    // Second call: live session returned.
    await expect(service.getRefreshSession("sess1")).resolves.toEqual(sessionData);
  });

  it("derives session TTL from the refresh expiry configuration", async () => {
    mockSetex.mockResolvedValue("OK");
    mockSadd.mockResolvedValue(1);

    await service.create({
      userId: "user1",
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      deviceName: "Chrome",
    });

    // 7d from the mocked JWT_REFRESH_EXPIRES_IN, not a hardcoded constant.
    expect(mockSetex).toHaveBeenCalledWith(
      expect.stringContaining("session:"),
      7 * 24 * 60 * 60,
      expect.any(String),
    );
  });
});
