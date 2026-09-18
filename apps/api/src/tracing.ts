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

const traceExporter = env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new OTLPTraceExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT })
  : undefined;

export const otelSDK = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || (env.PROCESS_ROLE === "worker" ? "worker" : "api"),
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(
      env.NODE_ENV === "production" ? env.OTEL_TRACE_SAMPLE_RATIO : 1.0,
    ),
  }),
  ...(traceExporter ? { spanProcessor: new BatchSpanProcessor(traceExporter) } : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
    }),
  ],
});

otelSDK.start();

process.on("SIGTERM", () => {
  otelSDK
    .shutdown()
    .then(() => logger.info("Tracing terminated"))
    .catch((error: unknown) => logger.error({ error }, "Error terminating tracing"));
});
