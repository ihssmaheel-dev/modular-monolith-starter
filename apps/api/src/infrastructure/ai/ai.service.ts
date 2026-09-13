import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import {
  AiChatRequest,
  AiChatResponse,
  AiChatResponseSchema,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiEmbeddingResponseSchema,
} from "@repo/contracts";
import { env } from "../../config/env";
import { CircuitBreaker } from "../../common/utils/circuit-breaker";
import { PinoLoggerService } from "../logger/logger.service";
import type { AiBridgeError } from "./ai-bridge.types";

const AI_TIMEOUT_MS = 60_000;
const FALLBACK_CIRCUIT_ERROR: AiBridgeError = {
  type: "AI_CIRCUIT_OPEN",
  message: "AI intelligence service is temporarily degraded (circuit open)",
};

@Injectable()
export class AiService {
  private readonly logger: PinoLoggerService;
  private readonly breaker: CircuitBreaker<AiBridgeError>;

  constructor(logger: PinoLoggerService) {
    this.logger = logger.child({ module: "AiService" });
    this.breaker = new CircuitBreaker<AiBridgeError>(
      {
        failureThreshold: 3,
        resetTimeoutMs: 30_000,
        onStateChange: (state) =>
          this.logger.warn({ state }, "AI service circuit breaker state changed"),
      },
      FALLBACK_CIRCUIT_ERROR,
    );
  }

  isAvailable(): boolean {
    return Boolean(env.AI_ENABLED && env.INTELLIGENCE_SERVICE_URL);
  }

  async chat(
    request: AiChatRequest,
    contextHeaders: Record<string, string> = {},
  ): Promise<Result<AiChatResponse, AiBridgeError>> {
    if (!this.isAvailable()) {
      return err({
        type: "AI_DISABLED",
        message: "AI intelligence service is disabled in configuration",
      });
    }

    return this.breaker.execute(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      try {
        const url = `${env.INTELLIGENCE_SERVICE_URL}/api/v1/chat`;
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(contextHeaders),
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          return err({
            type: "AI_UNAVAILABLE",
            message: `AI service returned HTTP ${response.status}: ${body.slice(0, 200)}`,
          });
        }

        const data = await response.json();
        const parsed = AiChatResponseSchema.safeParse(data);
        if (!parsed.success) {
          return err({
            type: "AI_INVALID_RESPONSE",
            message: `Invalid schema from AI service: ${parsed.error.message}`,
          });
        }

        return ok(parsed.data);
      } catch (error) {
        return err({
          type: "AI_UNAVAILABLE",
          message: error instanceof Error ? error.message : "AI request failed",
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  async streamChat(
    request: AiChatRequest,
    contextHeaders: Record<string, string> = {},
  ): Promise<Result<Response, AiBridgeError>> {
    if (!this.isAvailable()) {
      return err({
        type: "AI_DISABLED",
        message: "AI intelligence service is disabled in configuration",
      });
    }

    try {
      const url = `${env.INTELLIGENCE_SERVICE_URL}/api/v1/chat/stream`;
      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(contextHeaders),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return err({
          type: "AI_UNAVAILABLE",
          message: `AI stream request returned HTTP ${response.status}`,
        });
      }

      return ok(response);
    } catch (error) {
      return err({
        type: "AI_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Failed to open stream",
        cause: error,
      });
    }
  }

  async generateEmbeddings(
    request: AiEmbeddingRequest,
    contextHeaders: Record<string, string> = {},
  ): Promise<Result<AiEmbeddingResponse, AiBridgeError>> {
    if (!this.isAvailable()) {
      return err({
        type: "AI_DISABLED",
        message: "AI intelligence service is disabled in configuration",
      });
    }

    return this.breaker.execute(async () => {
      try {
        const url = `${env.INTELLIGENCE_SERVICE_URL}/api/v1/embeddings`;
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(contextHeaders),
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          return err({
            type: "AI_UNAVAILABLE",
            message: `AI embeddings returned HTTP ${response.status}`,
          });
        }

        const data = await response.json();
        const parsed = AiEmbeddingResponseSchema.safeParse(data);
        if (!parsed.success) {
          return err({
            type: "AI_INVALID_RESPONSE",
            message: "Invalid embeddings response structure",
          });
        }

        return ok(parsed.data);
      } catch (error) {
        return err({
          type: "AI_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Embeddings request failed",
          cause: error,
        });
      }
    });
  }

  private buildHeaders(contextHeaders: Record<string, string>): Record<string, string> {
    return {
      "content-type": "application/json",
      "X-Internal-Token": env.INTELLIGENCE_INTERNAL_SECRET,
      ...contextHeaders,
    };
  }
}
