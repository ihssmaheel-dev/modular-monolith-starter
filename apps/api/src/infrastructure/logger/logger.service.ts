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

const LOKI_LABELS = {
  application: env.APP_SLUG,
  service: `app-${env.PROCESS_ROLE}`,
  process_role: env.PROCESS_ROLE,
};

const REDACTED_PATHS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "email",
  "to",
  "recipients",
  "key",
  "sourceKey",
  "destinationKey",
  "expectedIp",
  "actualIp",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.email",
  "*.to",
  "*.recipients",
  "*.key",
  "*.sourceKey",
  "*.destinationKey",
  "*.expectedIp",
  "*.actualIp",
];

function buildDevTargets(): pino.TransportTargetOptions[] {
  const targets: pino.TransportTargetOptions[] = [
    {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
      level: env.LOG_LEVEL,
    },
  ];

  if (env.LOKI_HOST) {
    targets.push({
      target: "pino-loki",
      options: {
        host: env.LOKI_HOST,
        batching: true,
        interval: 2,
        silenceErrors: true,
        labels: LOKI_LABELS,
      },
      level: env.LOG_LEVEL,
    });
  }

  return targets;
}

function buildLoggerTransport():
  pino.TransportMultiOptions | pino.TransportSingleOptions | undefined {
  if (env.NODE_ENV !== "production") {
    return { targets: buildDevTargets() };
  }
  if (!env.LOKI_HOST) return undefined;
  return {
    targets: [
      {
        target: "pino/file",
        options: { destination: 1 },
        level: env.LOG_LEVEL,
      },
      {
        target: "pino-loki",
        options: {
          host: env.LOKI_HOST,
          batching: true,
          interval: 5,
          silenceErrors: true,
          labels: LOKI_LABELS,
        },
        level: env.LOG_LEVEL,
      },
    ],
  };
}

@Injectable()
export class PinoLoggerService implements OnModuleDestroy {
  private logger: pino.Logger;

  constructor(@Optional() @Inject(ClsService) private readonly cls?: ClsService) {
    this.logger = pino({
      name: `app-${env.PROCESS_ROLE}`,
      level: env.LOG_LEVEL,
      redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
      transport: buildLoggerTransport(),
    });
  }

  private enrichContext(context: LogContext): LogContext {
    const enriched = { ...context };

    if (enriched.error !== undefined && enriched.err === undefined) {
      enriched.err = enriched.error;
      delete enriched.error;
    }

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
    const child = Object.create(this) as PinoLoggerService;
    child.logger = this.logger.child(bindings);
    return child;
  }

  onModuleDestroy() {
    this.logger.flush();
  }
}
