import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { RedisService } from "./redis.service";
import { PinoLoggerService } from "../logger/logger.service";

const RELEASE_LUA_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const RENEW_LUA_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

export interface LockHandle {
  acquired: boolean;
  release: () => Promise<void>;
  renew: (ttlMs?: number) => Promise<boolean>;
}

@Injectable()
export class RedisLockService {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly redis: RedisService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RedisLockService" });
  }

  /** Returns true if a Redis client is available to handle locks. */
  isAvailable(): boolean {
    return Boolean(this.redis.getClient());
  }

  /**
   * Attempts to acquire an exclusive distributed lock.
   * Uses atomic SET NX PX with a unique ownership token.
   * If Redis is unavailable or unconfigured, returns { acquired: false, release: async () => {}, renew: async () => false }.
   */
  async acquire(key: string, ttlMs = 60_000): Promise<LockHandle> {
    const client = this.redis.getClient();
    if (!client) {
      return { acquired: false, release: async () => {}, renew: async () => false };
    }

    const lockKey = `lock:${key}`;
    const token = randomUUID();

    try {
      const result = await client.set(lockKey, token, "PX", ttlMs, "NX");
      if (result !== "OK") {
        return { acquired: false, release: async () => {}, renew: async () => false };
      }

      return {
        acquired: true,
        release: async () => {
          try {
            const currentClient = this.redis.getClient();
            if (!currentClient) return;
            await currentClient.eval(RELEASE_LUA_SCRIPT, 1, lockKey, token);
          } catch (error) {
            this.logger.warn({ error, key: lockKey }, "Failed to release distributed lock");
          }
        },
        renew: async (renewalTtlMs = ttlMs): Promise<boolean> => {
          try {
            const currentClient = this.redis.getClient();
            if (!currentClient) return false;
            const res = await currentClient.eval(RENEW_LUA_SCRIPT, 1, lockKey, token, renewalTtlMs);
            return res === 1;
          } catch (error) {
            this.logger.warn({ error, key: lockKey }, "Failed to renew distributed lock");
            return false;
          }
        },
      };
    } catch (error) {
      this.logger.error({ error, key: lockKey }, "Error acquiring distributed lock");
      return { acquired: false, release: async () => {}, renew: async () => false };
    }
  }

  /**
   * Executes fn exclusively if the distributed lock is acquired.
   * Runs an unreferenced heartbeat timer to auto-renew the lock during execution.
   * Automatically releases the lock when fn completes or throws.
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs = 60_000,
  ): Promise<{ executed: boolean; result?: T }> {
    const handle = await this.acquire(key, ttlMs);
    if (!handle.acquired) {
      return { executed: false };
    }

    const intervalMs = Math.max(1000, Math.floor(ttlMs / 3));
    let heartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
      try {
        const renewed = await handle.renew(ttlMs);
        if (!renewed) {
          this.logger.warn({ key }, "Distributed lock auto-renewal failed; lock may have expired");
        }
      } catch (error) {
        this.logger.warn({ error, key }, "Error during distributed lock auto-renewal");
      }
    }, intervalMs);

    heartbeatTimer.unref?.();

    try {
      const result = await fn();
      return { executed: true, result };
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      await handle.release();
    }
  }
}
