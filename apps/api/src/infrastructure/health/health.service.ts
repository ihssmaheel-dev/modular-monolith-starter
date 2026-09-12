import { Injectable } from "@nestjs/common";
import { I18nService } from "../i18n/i18n.service";
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
  HealthIndicatorResult,
  HealthIndicatorService,
  MemoryHealthIndicator,
} from "@nestjs/terminus";
import { DatabaseService } from "../database";
import { TenantContextService } from "../database";
import { RedisService } from "../redis/redis.service";
import { sql } from "drizzle-orm";
import { env } from "../../config/env";
import { WorkerHealthIndicator } from "./worker-health.indicator";

@Injectable()
export class PostgresHealthIndicator {
  constructor(
    private readonly database: DatabaseService,
    private readonly i18n: I18nService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const session = this.healthIndicatorService.check(key);
    try {
      const db = this.database.getDb();
      await (db as unknown as { execute: (q: unknown) => Promise<void> }).execute(sql`SELECT 1`);
      return session.up();
    } catch {
      return session.down({ message: this.i18n.t("api.health.databaseUnavailable") });
    }
  }
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly i18n: I18nService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const session = this.healthIndicatorService.check(key);
    try {
      const client = this.redis.getClient();
      if (!client) {
        return env.NODE_ENV === "production"
          ? session.down({ message: this.i18n.t("api.health.redisUnavailable") })
          : session.up({ message: this.i18n.t("api.health.redisUnconfigured") });
      }
      const pong = await client.ping();
      return pong === "PONG" ? session.up() : session.down({ pong });
    } catch {
      return session.down({ message: this.i18n.t("api.health.redisUnavailable") });
    }
  }
}

@Injectable()
export class OutboxHealthIndicator {
  constructor(
    private readonly database: DatabaseService,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly tenantContext: TenantContextService,
    private readonly i18n: I18nService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const session = this.healthIndicatorService.check(key);
    try {
      const result = await this.tenantContext.runSystem({ mode: env.TENANCY_MODE }, () =>
        this.database.runTransaction(async () => {
          const db = this.database.getTx() ?? this.database.getDb();
          return (
            db as unknown as {
              execute: (q: unknown) => Promise<{ rows: Array<{ count: string | number }> }>;
            }
          ).execute(sql`SELECT count(*)::int AS count FROM outbox_events WHERE status = 'PENDING'`);
        }),
      );
      const pendingCount = Number(result.rows[0]?.count ?? 0);
      const isHealthy = pendingCount < 5000;
      return isHealthy ? session.up({ pendingCount }) : session.down({ pendingCount });
    } catch {
      return session.down({ message: this.i18n.t("api.health.outboxUnavailable") });
    }
  }
}

@Injectable()
export class AppHealthService {
  private isDraining = false;

  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly postgres: PostgresHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly outbox: OutboxHealthIndicator,
    private readonly worker: WorkerHealthIndicator,
  ) {}

  markDraining(): void {
    this.isDraining = true;
  }

  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.memory.checkHeap("memory_heap", 500 * 1024 * 1024),
      () => this.postgres.isHealthy("postgres"),
      () => this.redis.isHealthy("redis"),
    ]);
  }

  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    if (this.isDraining) {
      return this.health.check([
        () => {
          throw new Error("Service is shutting down and draining traffic");
        },
      ]);
    }
    return this.health.check([
      () => this.postgres.isHealthy("postgres"),
      () => this.redis.isHealthy("redis"),
      () => this.outbox.isHealthy("outbox_queue"),
      () => this.worker.isHealthy("worker"),
    ]);
  }
}
