import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import {
  AppHealthService,
  PostgresHealthIndicator,
  RedisHealthIndicator,
  OutboxHealthIndicator,
} from "./health.service";
import { WorkerHealthIndicator } from "./indicators/worker-health.indicator";
import { ShutdownService } from "./shutdown/shutdown.service";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    AppHealthService,
    PostgresHealthIndicator,
    RedisHealthIndicator,
    OutboxHealthIndicator,
    WorkerHealthIndicator,
    ShutdownService,
  ],
})
export class HealthModule {}
