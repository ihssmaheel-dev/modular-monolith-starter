import { Injectable, OnModuleInit, OnApplicationShutdown, Optional } from "@nestjs/common";
import { PinoLoggerService } from "../logger/logger.service";
import { RedisService } from "../redis/redis.service";
import { env } from "../../config/env";
import Redis from "ioredis";
import type { FeatureFlagContext, FeatureFlagProvider } from "./feature-flags.types";

const REDIS_FLAGS_HASH = "feature_flags:overrides";
const REDIS_FLAGS_CHANNEL = "feature_flags:updates";

interface FlagMessage {
  type: "set" | "delete";
  flagKey: string;
  enabled?: boolean;
}

function parseConfiguredFlags(value: string): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, enabled]) => typeof enabled === "boolean"),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

@Injectable()
export class FeatureFlagsService
  implements FeatureFlagProvider, OnModuleInit, OnApplicationShutdown
{
  private readonly flags = new Map<string, boolean>();
  private subscriber: Redis | null = null;
  private readonly logger: PinoLoggerService;
  private unsubscribeReady?: () => void;

  constructor(
    logger: PinoLoggerService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    this.logger = logger.child({ module: "FeatureFlagsService" });
  }

  async onModuleInit(): Promise<void> {
    await this.loadInitialFlags();
    await this.setupSubscriber();
    this.unsubscribeReady = this.redisService?.onReady?.(async () => {
      await this.loadInitialFlags();
      await this.setupSubscriber();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.unsubscribeReady?.();
    this.unsubscribeReady = undefined;
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  private async loadInitialFlags(): Promise<void> {
    const client = this.redisService?.getClient();
    if (!client) return;
    try {
      const overrides = await client.hgetall(REDIS_FLAGS_HASH);
      this.flags.clear();
      for (const [key, val] of Object.entries(overrides)) {
        this.flags.set(key, val === "true" || val === "1");
      }
      this.logger.info(
        { count: Object.keys(overrides).length },
        "Loaded distributed feature flags from Redis",
      );
    } catch (error) {
      this.logger.error({ error }, "Failed to load initial feature flags from Redis");
    }
  }

  private async setupSubscriber(): Promise<void> {
    const client = this.redisService?.getClient();
    if (!client) return;
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch {
        this.subscriber.disconnect();
      }
      this.subscriber = null;
    }
    try {
      this.subscriber = client.duplicate();
      this.subscriber.on("error", (error) => {
        this.logger.error({ error }, "Feature flags Redis subscriber error");
      });
      await this.subscriber.subscribe(REDIS_FLAGS_CHANNEL);
      this.subscriber.on("message", (channel, message) => {
        if (channel === REDIS_FLAGS_CHANNEL) this.handleMessage(message);
      });
      this.logger.info({}, "Subscribed to distributed feature flag updates");
    } catch (error) {
      this.logger.error({ error }, "Failed to connect feature flags Redis subscriber");
      this.subscriber?.disconnect();
      this.subscriber = null;
    }
  }

  private handleMessage(message: string): void {
    try {
      const parsed: FlagMessage = JSON.parse(message);
      if (parsed.type === "set" && typeof parsed.enabled === "boolean") {
        this.flags.set(parsed.flagKey, parsed.enabled);
      } else if (parsed.type === "delete") {
        this.flags.delete(parsed.flagKey);
      }
    } catch (error) {
      this.logger.error({ error, message }, "Failed to process flag update event");
    }
  }

  isEnabled(flagKey: string, context?: FeatureFlagContext): boolean {
    if (this.flags.has(flagKey)) {
      const enabled = Boolean(this.flags.get(flagKey));
      this.logger.debug({ flagKey, enabled, context }, "Evaluated feature flag from memory");
      return enabled;
    }
    const configuredFlags = parseConfiguredFlags(env.FEATURE_FLAGS);
    if (Object.hasOwn(configuredFlags, flagKey)) {
      const enabled = configuredFlags[flagKey] ?? false;
      this.logger.debug({ flagKey, enabled, context }, "Evaluated flag from environment config");
      return enabled;
    }
    return false;
  }

  async setFlag(flagKey: string, enabled: boolean): Promise<void> {
    this.flags.set(flagKey, enabled);
    const client = this.redisService?.getClient();
    if (client) {
      try {
        await client.hset(REDIS_FLAGS_HASH, flagKey, enabled ? "1" : "0");
        const payload: FlagMessage = { type: "set", flagKey, enabled };
        await client.publish(REDIS_FLAGS_CHANNEL, JSON.stringify(payload));
      } catch (error) {
        this.logger.error({ flagKey, error }, "Failed to persist flag to Redis");
      }
    }
    this.logger.info({ flagKey, enabled }, "Feature flag override updated");
  }

  async deleteFlag(flagKey: string): Promise<void> {
    this.flags.delete(flagKey);
    const client = this.redisService?.getClient();
    if (client) {
      try {
        await client.hdel(REDIS_FLAGS_HASH, flagKey);
        const payload: FlagMessage = { type: "delete", flagKey };
        await client.publish(REDIS_FLAGS_CHANNEL, JSON.stringify(payload));
      } catch (error) {
        this.logger.error({ flagKey, error }, "Failed to delete flag from Redis");
      }
    }
  }

  getAllFlags(): Record<string, boolean> {
    return Object.fromEntries(this.flags.entries());
  }
}
