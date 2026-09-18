import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import os from "node:os";
import { env } from "../../config/env";
import { RedisService } from "../redis/redis.service";
import { PinoLoggerService } from "../logger/logger.service";
import { MetricsService } from "../metrics/metrics.service";

const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_TTL_SECONDS = 30;
export const WORKER_HEARTBEATS_REGISTRY_KEY = "worker:heartbeats:registry";

@Injectable()
export class WorkerHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly workerId = `${os.hostname()}:${process.pid}`;
  private readonly key = `worker:heartbeat:${this.workerId}`;
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly redis: RedisService,
    logger: PinoLoggerService,
    private readonly metrics: MetricsService,
  ) {
    this.logger = logger.child({ module: "WorkerHealthService" });
  }

  onModuleInit(): void {
    if (env.PROCESS_ROLE !== "api") void this.beat();
  }

  @Interval(HEARTBEAT_INTERVAL_MS)
  async beat(): Promise<void> {
    if (env.PROCESS_ROLE === "api") return;
    this.metrics.setGauge("worker_process_up", "Worker process event loop is active", 1);
    this.metrics.setGauge(
      "worker_heartbeat_timestamp_seconds",
      "Unix timestamp of the most recent worker heartbeat attempt",
      Date.now() / 1000,
    );
    const client = this.redis.getClient();
    if (!client) return;
    try {
      const now = Date.now();
      await Promise.all([
        client.set(this.key, new Date(now).toISOString(), "EX", HEARTBEAT_TTL_SECONDS),
        client.zadd(WORKER_HEARTBEATS_REGISTRY_KEY, now, this.workerId),
      ]);
    } catch (error) {
      this.logger.warn({ error }, "Worker heartbeat failed");
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.metrics.setGauge("worker_process_up", "Worker process event loop is active", 0);
    const client = this.redis.getClient();
    if (client) {
      await Promise.all([
        client.del(this.key).catch(() => undefined),
        client.zrem(WORKER_HEARTBEATS_REGISTRY_KEY, this.workerId).catch(() => undefined),
      ]);
    }
  }
}
