import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { env } from "./config/env";
import pino from "pino";

const logger = pino({ name: "tracing", level: env.LOG_LEVEL });

export function resolveOtelEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;
  return endpoint.replace("://localhost:", "://127.0.0.1:");
}

const otelEndpoint = resolveOtelEndpoint(env.OTEL_EXPORTER_OTLP_ENDPOINT);

const traceExporter = otelEndpoint ? new OTLPTraceExporter({ url: otelEndpoint }) : undefined;

export const otelSDK = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || (env.PROCESS_ROLE === "worker" ? "worker" : "api"),
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(
      env.NODE_ENV === "production" ? env.OTEL_TRACE_SAMPLE_RATIO : 1.0,
    ),
    remoteParentSampled: new TraceIdRatioBasedSampler(
      env.NODE_ENV === "production" ? env.OTEL_TRACE_SAMPLE_RATIO : 1.0,
    ),
  }),
  ...(traceExporter
    ? {
        spanProcessor: new BatchSpanProcessor(traceExporter, {
          scheduledDelayMillis: env.NODE_ENV === "production" ? 5000 : 1000,
        }),
      }
    : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
    }),
  ],
});

otelSDK.start();

const shutdownTracing = () => {
  otelSDK
    .shutdown()
    .then(() => logger.info("Tracing terminated"))
    .catch((error: unknown) => logger.error({ error }, "Error terminating tracing"));
};

process.on("SIGTERM", shutdownTracing);
process.on("SIGINT", shutdownTracing);
