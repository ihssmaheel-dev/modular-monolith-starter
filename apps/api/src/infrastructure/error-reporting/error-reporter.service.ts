import { Injectable, Optional } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import { trace } from "@opentelemetry/api";
import { CircuitBreaker } from "../../common/utils/circuit-breaker";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";
import { MetricsService } from "../metrics/metrics.service";
import type { ErrorReport, ErrorReportContext, ErrorReporter } from "./error-reporter";
import { sanitizeErrorText } from "./sanitize-telemetry";

const REPORT_TIMEOUT_MS = 3_000;
const MAX_ERROR_MESSAGE_LENGTH = 1_000;
const MAX_ERROR_STACK_LENGTH = 8_000;
const MAX_CONCURRENT_REPORTS = 5;

@Injectable()
export class ErrorReporterService implements ErrorReporter {
  private readonly logger: PinoLoggerService;
  private readonly breaker: CircuitBreaker<string>;
  private activeReports = 0;

  constructor(
    logger: PinoLoggerService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.logger = logger.child({ component: "error-reporter" });
    this.breaker = new CircuitBreaker(
      {
        failureThreshold: 3,
        resetTimeoutMs: 30_000,
        onStateChange: (state) => this.logger.warn({ state }, "Error reporter circuit changed"),
      },
      "REPORTER_UNAVAILABLE",
    );
  }

  async capture(exception: unknown, context: ErrorReportContext): Promise<void> {
    if (!env.ERROR_REPORTING_URL) return;
    if (this.activeReports >= MAX_CONCURRENT_REPORTS) {
      this.metrics?.incrementCounter(
        "error_reports_dropped_total",
        "Error reports dropped before delivery",
        1,
        { reason: "concurrency_limit" },
      );
      return;
    }
    this.activeReports += 1;
    try {
      const result = await this.breaker.execute(() =>
        this.deliver(this.createReport(exception, context)),
      );
      if (result.isErr()) {
        this.logger.warn({ error: result.error }, "Error report delivery failed");
      }
    } finally {
      this.activeReports -= 1;
    }
  }

  private createReport(exception: unknown, context: ErrorReportContext): ErrorReport {
    const span = trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    return {
      schemaVersion: 1,
      service: "api",
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      error: errorDetails(exception),
      context: traceId ? { ...context, traceId } : context,
    };
  }

  private async deliver(report: ErrorReport): Promise<Result<void, string>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
    try {
      const response = await fetch(env.ERROR_REPORTING_URL!, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.ERROR_REPORTING_TOKEN
            ? { authorization: `Bearer ${env.ERROR_REPORTING_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(report),
        signal: controller.signal,
      });
      return response.ok ? ok(undefined) : err(`HTTP_${response.status}`);
    } catch (error) {
      return err(error instanceof Error ? error.message : "REPORT_REQUEST_FAILED");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function errorDetails(exception: unknown): ErrorReport["error"] {
  if (exception instanceof Error) {
    return {
      name: exception.name,
      message: sanitizeErrorText(exception.message, MAX_ERROR_MESSAGE_LENGTH),
      ...(exception.stack
        ? { stack: sanitizeErrorText(exception.stack, MAX_ERROR_STACK_LENGTH) }
        : {}),
    };
  }
  return {
    name: "UnknownError",
    message: sanitizeErrorText(String(exception), MAX_ERROR_MESSAGE_LENGTH) ?? "UnknownError",
  };
}
