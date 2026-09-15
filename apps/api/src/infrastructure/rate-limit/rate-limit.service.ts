import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { MetricsService } from "../metrics/metrics.service";
import { PinoLoggerService } from "../logger/logger.service";
import { env } from "../../config/env";

const SLIDING_WINDOW_LOG_PREFIX = "ratelimit:";
const MS_PER_SECOND = 1000;
/**
 * Headroom above the limit retained in the sliding-window log. Counting
 * stays exact until maxRequests + headroom; beyond that every request is
 * rejected anyway, so trimming the oldest entries only bounds memory.
 */
const WINDOW_LOG_HEADROOM = 100;

export interface RateLimitConfig {
  windowSeconds?: number;
  maxRequests?: number;
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService {
  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RateLimitService" });
  }

  private readonly logger: PinoLoggerService;

  async check(key: string, config: RateLimitConfig = {}): Promise<RateLimitResult> {
    const windowSeconds = config.windowSeconds ?? env.RATE_LIMIT_TTL;
    const maxRequests = config.maxRequests ?? env.RATE_LIMIT_MAX;
    const now = Date.now();
    const windowStart = now - windowSeconds * MS_PER_SECOND;
    const redisKey = `${SLIDING_WINDOW_LOG_PREFIX}${key}`;

    const client = this.redis.getClient();
    if (!client) {
      // Bounded labels only: the raw key carries client IPs/identities and
      // would explode metric cardinality precisely during an outage.
      const scope = key.includes("/auth/") || key.includes("auth:") ? "auth" : "api";
      const route = key.includes(":route:") ? (key.split(":route:")[1] ?? "unknown") : "unknown";
      this.metrics.incrementCounter(
        "rate_limit_redis_unavailable",
        "Redis unavailable for rate limiting",
        1,
        { scope, route },
      );
      this.logger.warn({ scope, route }, "Rate limit Redis unavailable");
      const isAuth = key.includes("/auth/") || key.includes("auth:");
      if (isAuth || config.failClosed) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: Math.ceil((now + windowSeconds * MS_PER_SECOND) / MS_PER_SECOND),
        };
      }
      return {
        allowed: true,
        remaining: maxRequests,
        resetAt: Math.ceil((now + windowSeconds * MS_PER_SECOND) / MS_PER_SECOND),
      };
    }

    const keepNewest = maxRequests + WINDOW_LOG_HEADROOM;
    const script = `
      redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
      redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
      redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -tonumber(ARGV[5]) - 1)
      local count = redis.call('ZCARD', KEYS[1])
      redis.call('EXPIRE', KEYS[1], ARGV[4])
      return count
    `;

    const count = (await client.eval(
      script,
      1,
      redisKey,
      windowStart.toString(),
      now.toString(),
      `${now}:${crypto.randomUUID()}`,
      windowSeconds.toString(),
      keepNewest.toString(),
    )) as number;

    const remaining = Math.max(0, maxRequests - count);
    const resetAt = Math.ceil((now + windowSeconds * MS_PER_SECOND) / MS_PER_SECOND);

    return { allowed: count <= maxRequests, remaining, resetAt };
  }

  async checkByIp(ip: string, config?: RateLimitConfig): Promise<RateLimitResult> {
    return this.check(`ip:${ip}`, config);
  }

  async checkByTenant(tenantId: string, config?: RateLimitConfig): Promise<RateLimitResult> {
    return this.check(`tenant:${tenantId}`, config);
  }

  async checkByRoute(route: string, config?: RateLimitConfig): Promise<RateLimitResult> {
    return this.check(`route:${route}`, config);
  }
}
