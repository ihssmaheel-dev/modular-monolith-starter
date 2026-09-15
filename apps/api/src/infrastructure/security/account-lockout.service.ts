import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { PinoLoggerService } from "../logger/logger.service";
import { env } from "../../config/env";
import { createHash } from "node:crypto";

const LOCKOUT_PREFIX = "lockout:";
export const MAX_MEMORY_LOCKOUT_ENTRIES = 5_000;
const MEMORY_SWEEP_INTERVAL_MS = 60_000;

interface InMemoryAttempt {
  count: number;
  expiresAt: number;
}

@Injectable()
export class AccountLockoutService implements OnApplicationShutdown {
  private readonly memoryStore = new Map<string, InMemoryAttempt>();
  private readonly logger: PinoLoggerService;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly redis: RedisService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "AccountLockoutService" });
  }

  async isLockedOut(email: string): Promise<boolean> {
    const client = this.redis.getClient();
    if (!client) {
      const entry = this.memoryStore.get(email);
      if (!entry) return false;
      if (Date.now() > entry.expiresAt) {
        this.memoryStore.delete(email);
        return false;
      }
      if (entry.count >= env.LOCKOUT_MAX_ATTEMPTS) {
        this.logger.warn(
          { identityHash: hashIdentity(email), attempts: entry.count },
          "Account locked out (memory fallback)",
        );
        return true;
      }
      return false;
    }

    const key = `${LOCKOUT_PREFIX}${email}`;
    const attempts = await client.get(key);
    if (!attempts) return false;

    if (Number(attempts) >= env.LOCKOUT_MAX_ATTEMPTS) {
      const ttl = await client.ttl(key);
      if (ttl > 0) {
        this.logger.warn(
          { identityHash: hashIdentity(email), attempts: Number(attempts), ttl },
          "Account locked out",
        );
        return true;
      }
      await client.del(key);
    }
    return false;
  }

  get memorySize(): number {
    return this.memoryStore.size;
  }

  async recordFailedAttempt(email: string): Promise<void> {
    const client = this.redis.getClient();
    const ttlSeconds = env.LOCKOUT_DURATION_MINUTES * 60;

    if (!client) {
      this.ensureSweepTimer();
      const now = Date.now();
      const existing = this.memoryStore.get(email);
      if (!existing || now > existing.expiresAt) {
        if (!existing && this.memoryStore.size >= MAX_MEMORY_LOCKOUT_ENTRIES) {
          this.sweepExpired();
          if (this.memoryStore.size >= MAX_MEMORY_LOCKOUT_ENTRIES) {
            const oldestKey = this.memoryStore.keys().next().value;
            if (oldestKey) this.memoryStore.delete(oldestKey);
          }
        }
        this.memoryStore.set(email, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      } else {
        existing.count += 1;
      }
      this.logger.warn(
        { identityHash: hashIdentity(email), attempts: this.memoryStore.get(email)?.count },
        "Failed login recorded (memory)",
      );
      return;
    }

    const key = `${LOCKOUT_PREFIX}${email}`;
    const current = await client.incr(key);

    if (current === 1) {
      await client.expire(key, ttlSeconds);
    }

    this.logger.warn(
      { identityHash: hashIdentity(email), attempts: current },
      "Failed login attempt recorded",
    );
  }

  async resetAttempts(email: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) {
      this.memoryStore.delete(email);
      return;
    }

    await client.del(`${LOCKOUT_PREFIX}${email}`);
  }

  sweepExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.memoryStore.entries()) {
      if (now > entry.expiresAt) {
        this.memoryStore.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.memoryStore.clear();
  }

  private ensureSweepTimer(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweepExpired(), MEMORY_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }
}

function hashIdentity(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 16);
}
