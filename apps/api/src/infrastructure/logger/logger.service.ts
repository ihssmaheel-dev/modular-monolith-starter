import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import pino from "pino";
import { trace } from "@opentelemetry/api";
import { env } from "../../config/env";

export interface LogContext {
  userId?: string;
  tenantId?: string;
  requestId?: string;
  trace_id?: string;
  span_id?: string;
  [key: string]: unknown;
}

@Injectable()
export class PinoLoggerService implements OnModuleDestroy {
  private logger: pino.Logger;

  constructor(@Optional() @Inject(ClsService) private readonly cls?: ClsService) {
    this.logger = pino({
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                singleLine: true,
                translateTime: "HH:MM:ss.l",
                ignore: "pid,hostname",
              },
            }
          : env.LOKI_HOST && !env.LOKI_HOST.includes("localhost")
            ? {
                target: "pino-loki",
                options: {
                  batching: true,
                  interval: 5,
                  host: env.LOKI_HOST,
                  labels: { application: "api-service" },
                },
              }
            : undefined,
    });
  }

  private enrichContext(context: LogContext): LogContext {
    const enriched = { ...context };

    if (this.cls?.isActive()) {
      const requestId = this.cls.get("requestId");
      if (requestId && !enriched.requestId) {
        enriched.requestId = requestId;
      }

      const tenantId = this.cls.get("tenantId");
      if (tenantId && !enriched.tenantId) {
        enriched.tenantId = tenantId;
      }

      const userId = this.cls.get("userId");
      if (userId && !enriched.userId) {
        enriched.userId = userId;
      }
    }

    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      enriched.trace_id = spanContext.traceId;
      enriched.span_id = spanContext.spanId;
    }

    return enriched;
  }

  info(context: LogContext, message: string) {
    this.logger.info(this.enrichContext(context), message);
  }

  warn(context: LogContext, message: string) {
    this.logger.warn(this.enrichContext(context), message);
  }

  error(context: LogContext, message: string) {
    this.logger.error(this.enrichContext(context), message);
  }

  debug(context: LogContext, message: string) {
    this.logger.debug(this.enrichContext(context), message);
  }

  child(bindings: Record<string, unknown>): PinoLoggerService {
    const child = new PinoLoggerService(this.cls);
    child.logger = this.logger.child(bindings);
    return child;
  }

  onModuleDestroy() {
    this.logger.flush();
  }
}
