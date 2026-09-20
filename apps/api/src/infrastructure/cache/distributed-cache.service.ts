import { Injectable, OnModuleInit, OnApplicationShutdown } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { PinoLoggerService } from "../logger/logger.service";
import Redis from "ioredis";
import { CacheMetricsService } from "./cache-metrics.service";

const CACHE_CHANNEL = "cache:invalidation";
export const MAX_CACHE_SIZE = 10_000;
const CACHE_SWEEP_INTERVAL_MS = 60_000;

@Injectable()
export class DistributedCacheService implements OnModuleInit, OnApplicationShutdown {
  private subscriber: Redis | null = null;
  private logger: PinoLoggerService;
  private cache = new Map<string, { value: unknown; exp: number }>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private unsubscribeReady?: () => void;

  constructor(
    private readonly redisService: RedisService,
    private readonly cacheMetrics: CacheMetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "DistributedCacheService" });
  }

  async onModuleInit() {
    this.sweepTimer = setInterval(() => this.sweepExpired(), CACHE_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();

    this.unsubscribeReady = this.redisService.onReady?.(() => this.ensureSubscriber());
    await this.ensureSubscriber();
  }

  private async ensureSubscriber(): Promise<void> {
    if (this.subscriber) return;
    const client = this.redisService.getClient();
    if (!client) {
      this.logger.warn(
        {},
        "Redis is unavailable. Distributed cache invalidation will only work locally.",
      );
      return;
    }

    try {
      this.subscriber = client.duplicate();

      this.subscriber.on("error", (error) => {
        this.logger.error({ error }, "Cache subscriber error");
      });

      await this.subscriber.subscribe(CACHE_CHANNEL);
      this.logger.info({}, "Subscribed to cache invalidation channel");

      this.subscriber.on("message", (channel, message) => {
        if (channel === CACHE_CHANNEL) {
          this.logger.debug({ key: message }, "Received cache invalidation event");
          this.deleteLocal(message);
        }
      });
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize distributed cache subscriber");
      this.subscriber?.disconnect();
      this.subscriber = null;
    }
  }

  async onApplicationShutdown() {
    this.unsubscribeReady?.();
    this.unsubscribeReady = undefined;
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    this.cache.clear();
  }

  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) {
      this.cacheMetrics.recordMiss("memory");
      return undefined;
    }

    if (Date.now() > item.exp) {
      this.cache.delete(key);
      this.cacheMetrics.recordMiss("memory");
      return undefined;
    }

    this.cacheMetrics.recordHit("memory");
    return structuredClone(item.value) as T;
  }

  get size(): number {
    return this.cache.size;
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    if (!this.cache.has(key) && this.cache.size >= MAX_CACHE_SIZE) {
      this.sweepExpired();
      if (this.cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
          this.cache.delete(oldestKey);
          this.cacheMetrics.recordEvict("memory");
        }
      }
    }
    this.cache.set(key, {
      value: structuredClone(value),
      exp: Date.now() + ttlSeconds * 1000,
    });
    this.cacheMetrics.recordSet("memory");
  }

  sweepExpired(): number {
    const now = Date.now();
    let evictedCount = 0;
    for (const [key, item] of this.cache.entries()) {
      if (now > item.exp) {
        this.cache.delete(key);
        this.cacheMetrics.recordEvict("memory");
        evictedCount++;
      }
    }
    return evictedCount;
  }

  private deleteLocal(key: string) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.cacheMetrics.recordEvict("memory");
    }
  }

  /**
   * Deletes the key from local memory and globally broadcasts an invalidation event.
   */
  async invalidateGlobal(key: string) {
    this.deleteLocal(key);
    const publisher = this.redisService.getClient();
    if (publisher) {
      try {
        await publisher.del(key);
        if (!key.startsWith("cache:")) {
          await publisher.del(`cache:${key}`);
        }
        await publisher.publish(CACHE_CHANNEL, key);
      } catch (error) {
        this.logger.error({ key, error }, "Failed to publish global cache invalidation");
      }
    }
  }
}
