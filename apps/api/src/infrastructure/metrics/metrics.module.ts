import { Module, Global } from "@nestjs/common";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import {
  register,
  openMetricsContentType,
  type Registry,
  type OpenMetricsContentType,
} from "prom-client";
import { MetricsService } from "./metrics.service";
import { WorkerMetricsServer } from "./worker-metrics.server";

try {
  (register as unknown as Registry<OpenMetricsContentType>).setContentType(openMetricsContentType);
} catch {
  // Graceful fallback if openMetricsContentType is unsupported
}

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: "/metrics",
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [MetricsService, WorkerMetricsServer],
  exports: [MetricsService, PrometheusModule],
})
export class MetricsModule {}
