import { Injectable, Optional } from "@nestjs/common";
import { HealthIndicatorResult, HealthIndicatorService } from "@nestjs/terminus";
import { env } from "../../../config/env";
import { I18nService } from "../../i18n/i18n.service";
import { RedisService } from "../../redis/redis.service";
import { MetricsService } from "../../metrics/metrics.service";

@Injectable()
export class WorkerHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly i18n: I18nService,
    private readonly healthIndicatorService: HealthIndicatorService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const session = this.healthIndicatorService.check(key);
    if (env.NODE_ENV !== "production" || env.PROCESS_ROLE === "worker") return session.up();
    const client = this.redis.getClient();
    if (!client) {
      this.metricsService?.setGauge("worker_heartbeats_active", "Active worker heartbeats", 0);
      return this.down(session);
    }
    try {
      let cursor = "0";
      let activeCount = 0;
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          "MATCH",
          "worker:heartbeat:*",
          "COUNT",
          "100",
        );
        activeCount += keys.length;
        cursor = nextCursor;
      } while (cursor !== "0");
      this.metricsService?.setGauge(
        "worker_heartbeats_active",
        "Active worker heartbeats",
        activeCount,
      );
      return activeCount > 0 ? session.up({ activeCount }) : this.down(session);
    } catch {
      this.metricsService?.setGauge("worker_heartbeats_active", "Active worker heartbeats", 0);
      return this.down(session);
    }
  }

  private down(session: ReturnType<HealthIndicatorService["check"]>): HealthIndicatorResult {
    return session.down({ message: this.i18n.t("api.health.workerUnavailable") });
  }
}
