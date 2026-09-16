import { Injectable } from "@nestjs/common";
import { context, propagation } from "@opentelemetry/api";
import { err, ok, type Result } from "neverthrow";
import { env } from "../../../../config/env";
import { Bulkhead } from "../../../../common/utils/bulkhead";
import { CircuitBreaker } from "../../../../common/utils/circuit-breaker";
import { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { IntelligenceError } from "../../domain/errors/intelligence.errors";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface IntelligenceGenerationRequest {
  runId: string;
  tenantId: string;
  prompt: string;
  context: Array<{ citationId: string; content: string; source: string }>;
  outputSchema?: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface IntelligenceGenerationResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  citations: string[];
}

export interface IntelligenceParsedDocument {
  contentType: string;
  chunks: Array<{ ordinal: number; content: string; contentHash: string }>;
}

export interface IntelligenceEmbeddingResponse {
  model: string;
  vectors: number[][];
}

@Injectable()
export class IntelligenceClient {
  private readonly bulkhead: Bulkhead<IntelligenceError>;
  private readonly breaker: CircuitBreaker<IntelligenceError>;
  private readonly logger: PinoLoggerService;

  constructor(
    logger: PinoLoggerService,
    private readonly metrics: MetricsService,
  ) {
    this.logger = logger.child({ module: "IntelligenceClient" });
    this.metrics.setGauge(
      "intelligence_enabled",
      "Whether the optional intelligence capability is enabled",
      env.INTELLIGENCE_ENABLED ? 1 : 0,
    );
    this.bulkhead = new Bulkhead({ maxConcurrent: 8, maxKeys: 256 }, { type: "INTELLIGENCE_BUSY" });
    this.breaker = new CircuitBreaker(
      {
        failureThreshold: 5,
        resetTimeoutMs: 30_000,
        onStateChange: (state) => {
          this.metrics.setGauge(
            "intelligence_provider_circuit_state",
            "Intelligence provider circuit state (0 closed, 1 half-open, 2 open)",
            state === "OPEN" ? 2 : state === "HALF_OPEN" ? 1 : 0,
          );
        },
      },
      { type: "INTELLIGENCE_UNAVAILABLE" },
    );
  }

  async generate(
    request: IntelligenceGenerationRequest,
  ): Promise<Result<IntelligenceGenerationResponse, IntelligenceError>> {
    return this.execute("generation", request.tenantId, () =>
      this.post<IntelligenceGenerationResponse>(
        "/internal/v1/generations",
        {
          run_id: request.runId,
          tenant_id: request.tenantId,
          prompt: request.prompt,
          context: request.context.map((item) => ({
            citation_id: item.citationId,
            content: item.content,
            source: item.source,
          })),
          output_schema: request.outputSchema,
          max_output_tokens: request.maxOutputTokens,
        },
        (value) => isGenerationResponse(value),
      ),
    );
  }

  async parseDocument(
    tenantId: string,
    documentId: string,
    signedUrl: string,
  ): Promise<Result<IntelligenceParsedDocument, IntelligenceError>> {
    return this.execute("document_parse", tenantId, () =>
      this.post<IntelligenceParsedDocument>(
        "/internal/v1/documents/parse",
        { tenant_id: tenantId, document_id: documentId, signed_url: signedUrl },
        (value) => isParsedDocument(value),
      ),
    );
  }

  async embed(
    tenantId: string,
    requestId: string,
    texts: string[],
  ): Promise<Result<IntelligenceEmbeddingResponse, IntelligenceError>> {
    return this.execute("embedding", tenantId, () =>
      this.post<IntelligenceEmbeddingResponse>(
        "/internal/v1/embeddings",
        { tenant_id: tenantId, request_id: requestId, texts },
        (value) => isEmbeddingResponse(value),
      ),
    );
  }

  private async execute<T>(
    operation: string,
    tenantId: string,
    action: () => Promise<Result<T, IntelligenceError>>,
  ): Promise<Result<T, IntelligenceError>> {
    if (!env.INTELLIGENCE_ENABLED) return err({ type: "INTELLIGENCE_DISABLED" });
    if (!env.INTELLIGENCE_SERVICE_URL || !env.INTELLIGENCE_SERVICE_TOKEN) {
      return err({ type: "INTELLIGENCE_NOT_CONFIGURED" });
    }
    const result = await this.bulkhead.execute(
      () => this.breaker.execute(action),
      tenantId.slice(0, 128),
    );
    if (result.isErr()) {
      this.metrics.incrementCounter(
        "intelligence_requests_total",
        "Intelligence requests by operation and outcome",
        1,
        { operation, outcome: result.error.type },
      );
    }
    return result;
  }

  private async post<T>(
    path: string,
    payload: unknown,
    guard: (value: unknown) => value is T,
  ): Promise<Result<T, IntelligenceError>> {
    const serviceUrl = env.INTELLIGENCE_SERVICE_URL;
    const serviceToken = env.INTELLIGENCE_SERVICE_TOKEN;
    if (!serviceUrl || !serviceToken) return err({ type: "INTELLIGENCE_NOT_CONFIGURED" });
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json",
        "x-service-audience": env.INTELLIGENCE_SERVICE_AUDIENCE,
      };
      propagation.inject(context.active(), headers);
      const response = await fetch(new URL(path, serviceUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
        return err({ type: "INTELLIGENCE_INVALID_RESPONSE" });
      }
      if (!response.ok) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        return err({ type: "INTELLIGENCE_INVALID_RESPONSE" });
      }
      return guard(value) ? ok(value) : err({ type: "INTELLIGENCE_INVALID_RESPONSE" });
    } catch (error) {
      this.logger.warn({ error: String(error) }, "Intelligence service request failed");
      return err({ type: "INTELLIGENCE_UNAVAILABLE" });
    }
  }
}

function isEmbeddingResponse(value: unknown): value is IntelligenceEmbeddingResponse {
  if (!isRecord(value) || typeof value.model !== "string" || !Array.isArray(value.vectors)) {
    return false;
  }
  return value.vectors.every(
    (vector) => Array.isArray(vector) && vector.every((item) => typeof item === "number"),
  );
}

function isGenerationResponse(value: unknown): value is IntelligenceGenerationResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.content === "string" &&
    typeof value.model === "string" &&
    typeof value.inputTokens === "number" &&
    typeof value.outputTokens === "number" &&
    typeof value.estimatedCostUsd === "number" &&
    Array.isArray(value.citations) &&
    value.citations.every((item) => typeof item === "string")
  );
}

function isParsedDocument(value: unknown): value is IntelligenceParsedDocument {
  if (!isRecord(value) || typeof value.contentType !== "string" || !Array.isArray(value.chunks)) {
    return false;
  }
  return value.chunks.every(
    (chunk) =>
      isRecord(chunk) &&
      typeof chunk.ordinal === "number" &&
      typeof chunk.content === "string" &&
      typeof chunk.contentHash === "string",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
