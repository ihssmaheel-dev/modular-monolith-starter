import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { finalize, tap } from "rxjs/operators";
import { trace } from "@opentelemetry/api";
import { MetricsService } from "./metrics.service";
import type { FastifyRequest, FastifyReply } from "fastify";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const res = ctx.getResponse<FastifyReply>();

    const method = req.method;
    // We strictly use routeOptions.url if available, falling back to a fixed string
    // to prevent high-cardinality explosion in Prometheus from raw URLs with parameter values.
    const route = req.routeOptions?.url ?? "unmatched_route";

    const startTime = process.hrtime();

    this.metricsService.incrementGauge(
      "http_active_connections",
      "Number of active HTTP connections",
      1,
      {
        method,
        route,
      },
    );

    let errorStatus: number | undefined;
    return next.handle().pipe(
      tap({ error: (error: unknown) => (errorStatus = this.getErrorStatus(error)) }),
      finalize(() => {
        try {
          const resolvedStatus =
            errorStatus ??
            (typeof res.statusCode === "number" && Number.isFinite(res.statusCode)
              ? res.statusCode
              : 500);
          this.recordMetrics(startTime, method, route, resolvedStatus);
        } catch {
          // Never allow metric telemetry to interrupt request finalization or socket unsubscription
        }
      }),
    );
  }

  private getErrorStatus(error: unknown): number {
    if (typeof error !== "object" || error === null) return 500;
    const value = error as Record<string, unknown>;
    if (typeof value.status === "number") return value.status;
    return typeof value.statusCode === "number" ? value.statusCode : 500;
  }

  private getExemplar(): Record<string, string> | undefined {
    const traceId = trace.getActiveSpan()?.spanContext()?.traceId;
    return traceId ? { trace_id: traceId } : undefined;
  }

  private recordMetrics(
    startTime: [number, number],
    method: string,
    route: string,
    statusCode: number,
  ) {
    this.metricsService.decrementGauge(
      "http_active_connections",
      "Number of active HTTP connections",
      1,
      { method, route },
    );

    const diff = process.hrtime(startTime);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const labels = { method, route, status_code: statusCode };

    this.metricsService.recordHistogram(
      "http_request_duration_seconds",
      "Duration of HTTP requests in seconds",
      durationInSeconds,
      labels,
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      this.getExemplar(),
    );

    this.metricsService.incrementCounter(
      "http_requests_total",
      "Total number of HTTP requests",
      1,
      labels,
    );
  }
}
