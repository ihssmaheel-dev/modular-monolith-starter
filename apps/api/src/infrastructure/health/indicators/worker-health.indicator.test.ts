import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env";
import { WorkerHealthIndicator } from "./worker-health.indicator";
import type { RedisService } from "../../redis/redis.service";
import type { I18nService } from "../../i18n/i18n.service";
import type { HealthIndicatorService } from "@nestjs/terminus";

const originalNodeEnv = env.NODE_ENV;
const originalProcessRole = env.PROCESS_ROLE;

afterEach(() => {
  env.NODE_ENV = originalNodeEnv;
  env.PROCESS_ROLE = originalProcessRole;
});

describe("WorkerHealthIndicator", () => {
  it("reports a live worker heartbeat in production using sorted set registry", async () => {
    env.NODE_ENV = "production";
    env.PROCESS_ROLE = "api";
    const session = healthSession();
    const redis = {
      getClient: vi.fn().mockReturnValue({
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        zcount: vi.fn().mockResolvedValue(2),
      }),
    } as unknown as RedisService;
    const indicator = createIndicator(redis, session);

    await indicator.isHealthy("worker");

    expect(session.up).toHaveBeenCalledWith({ activeCount: 2 });
    expect(session.down).not.toHaveBeenCalled();
  });

  it("fails readiness when no worker heartbeat exists in sorted set registry", async () => {
    env.NODE_ENV = "production";
    env.PROCESS_ROLE = "api";
    const session = healthSession();
    const redis = {
      getClient: vi.fn().mockReturnValue({
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        zcount: vi.fn().mockResolvedValue(0),
      }),
    } as unknown as RedisService;
    const indicator = createIndicator(redis, session);

    await indicator.isHealthy("worker");

    expect(session.down).toHaveBeenCalledOnce();
    expect(session.up).not.toHaveBeenCalled();
  });
});

function healthSession() {
  return {
    up: vi.fn(() => ({ worker: { status: "up" } })),
    down: vi.fn(() => ({ worker: { status: "down" } })),
  };
}

function createIndicator(
  redis: RedisService,
  session: ReturnType<typeof healthSession>,
): WorkerHealthIndicator {
  const health = { check: vi.fn(() => session) } as unknown as HealthIndicatorService;
  const i18n = { t: vi.fn(() => "worker unavailable") } as unknown as I18nService;
  return new WorkerHealthIndicator(redis, i18n, health);
}
