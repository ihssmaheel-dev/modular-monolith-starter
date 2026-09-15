import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";

const MAX_RETRIES_PER_REQUEST = 3;
const RETRY_DELAY_MULTIPLIER = 200;
const MAX_RETRY_DELAY = 2000;
const STARTUP_READY_TIMEOUT_MS = 5000;
type ReadyListener = () => void | Promise<void>;

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private client: Redis | null = null;
  private logger: PinoLoggerService;
  private readonly readyListeners = new Set<ReadyListener>();

  constructor(logger: PinoLoggerService) {
    this.logger = logger.child({ module: "RedisService" });
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async connect(): Promise<Redis | null> {
    if (this.client) return this.getClient();
    if (!env.REDIS_URL) {
      this.logger.warn({}, "REDIS_URL not provided. Redis dependents will be disabled.");
      return null;
    }

    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
      retryStrategy(times) {
        const backoff = Math.min(times * RETRY_DELAY_MULTIPLIER, MAX_RETRY_DELAY);
        return backoff + Math.floor(Math.random() * RETRY_DELAY_MULTIPLIER);
      },
    });
    client.on("error", (error) => this.logger.error({ error }, "Redis client error"));
    client.on("ready", () => this.notifyReady());
    this.client = client;
    await Promise.race([
      new Promise<void>((resolve) => client.once("ready", resolve)),
      new Promise<void>((resolve) => setTimeout(resolve, STARTUP_READY_TIMEOUT_MS)),
    ]);
    if (client.status !== "ready") {
      this.logger.error({}, "Redis was not ready before the startup deadline; reconnect continues");
    }
    return this.getClient();
  }

  getClient(): Redis | null {
    return this.client?.status === "ready" ? this.client : null;
  }

  onReady(listener: ReadyListener): () => void {
    this.readyListeners.add(listener);
    if (this.getClient()) void this.invokeReadyListener(listener);
    return () => this.readyListeners.delete(listener);
  }

  private notifyReady(): void {
    for (const listener of this.readyListeners) void this.invokeReadyListener(listener);
  }

  private async invokeReadyListener(listener: ReadyListener): Promise<void> {
    try {
      await listener();
    } catch (error) {
      this.logger.error({ error }, "Redis readiness listener failed");
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.readyListeners.clear();
    if (!client) return;
    try {
      await client.quit();
    } catch (error) {
      this.logger.warn({ error }, "Redis client did not quit cleanly");
      client.disconnect();
    }
  }
}
