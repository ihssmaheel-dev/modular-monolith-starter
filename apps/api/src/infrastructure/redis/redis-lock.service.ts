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

export interface LockHandle {
  acquired: boolean;
  release: () => Promise<void>;
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
   * If Redis is unavailable or unconfigured, returns { acquired: false, release: async () => {} }.
   */
  async acquire(key: string, ttlMs = 60_000): Promise<LockHandle> {
    const client = this.redis.getClient();
    if (!client) {
      return { acquired: false, release: async () => {} };
    }

    const lockKey = `lock:${key}`;
    const token = randomUUID();

    try {
      const result = await client.set(lockKey, token, "PX", ttlMs, "NX");
      if (result !== "OK") {
        return { acquired: false, release: async () => {} };
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
      };
    } catch (error) {
      this.logger.error({ error, key: lockKey }, "Error acquiring distributed lock");
      return { acquired: false, release: async () => {} };
    }
  }

  /**
   * Executes fn exclusively if the distributed lock is acquired.
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

    try {
      const result = await fn();
      return { executed: true, result };
    } finally {
      await handle.release();
    }
  }
}
