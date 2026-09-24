import { Injectable, Logger } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type {
  AuthenticatedUser,
  SearchDocumentResult,
  SearchDocumentsRequest,
  UnaryChatRequest,
  UnaryChatResponse,
} from "@repo/contracts";
import { env } from "../../../../config/env";
import { CircuitBreaker } from "../../../../common/utils/circuit-breaker";
import {
  IntelligenceDisabledError,
  type IntelligenceError,
  IntelligenceInvalidModelError,
  IntelligencePayloadTooLargeError,
  IntelligenceRateLimitError,
  IntelligenceTimeoutError,
  IntelligenceUnauthorizedError,
  IntelligenceUnavailableError,
} from "../../domain/errors/intelligence.errors";
import { IntelligenceHmacService } from "./intelligence-hmac.service";

interface PythonErrorPayload {
  code?: string;
  i18n_key?: string;
  message?: string;
  status?: number;
  request_id?: string;
}

@Injectable()
export class IntelligenceGatewayService {
  private readonly logger = new Logger(IntelligenceGatewayService.name);
  private readonly circuitBreaker: CircuitBreaker<IntelligenceError>;

  constructor(private readonly hmacService: IntelligenceHmacService) {
    this.circuitBreaker = new CircuitBreaker(
      {
        failureThreshold: 3,
        resetTimeoutMs: 30_000,
        onStateChange: (state) => {
          this.logger.warn(`Intelligence circuit breaker transitioned to state: ${state}`);
        },
      },
      new IntelligenceUnavailableError("Intelligence circuit breaker is open"),
    );
  }

  private getAllowedModels(): Set<string> {
    const raw = env.INTELLIGENCE_ALLOWED_MODELS || "";
    return new Set(
      raw
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    );
  }

  async executeUnaryChat(
    request: UnaryChatRequest,
    options?: {
      actor?: AuthenticatedUser;
      tenantId?: string;
      requestId?: string;
    },
  ): Promise<Result<UnaryChatResponse, IntelligenceError>> {
    if (!env.INTELLIGENCE_ENABLED) {
      return err(new IntelligenceDisabledError());
    }

    if (request.model && !this.getAllowedModels().has(request.model)) {
      return err(new IntelligenceInvalidModelError(request.model));
    }

    return this.circuitBreaker.execute(async () => {
      return this.sendRequest<UnaryChatResponse>(
        "/api/v1/chat/unary",
        "POST",
        request,
        options?.actor,
        { requestId: options?.requestId, tenantId: options?.tenantId },
      );
    });
  }

  async searchDocuments(
    request: SearchDocumentsRequest,
    tenantId?: string,
    context?: { actor?: AuthenticatedUser; requestId?: string },
  ): Promise<Result<SearchDocumentResult[], IntelligenceError>> {
    if (!env.INTELLIGENCE_ENABLED) {
      return err(new IntelligenceDisabledError());
    }

    return this.circuitBreaker.execute(async () => {
      return this.sendRequest<SearchDocumentResult[]>(
        "/api/v1/embeddings/search",
        "POST",
        request,
        context?.actor,
        { requestId: context?.requestId, tenantId },
      );
    });
  }

  private async sendRequest<T>(
    endpoint: string,
    method: "GET" | "POST",
    payload?: unknown,
    user?: AuthenticatedUser,
    context?: { requestId?: string; tenantId?: string },
  ): Promise<Result<T, IntelligenceError>> {
    try {
      const baseUrl = env.INTELLIGENCE_URL.replace(/\/+$/, "");
      const url = `${baseUrl}${endpoint}`;
      const bodyStr = payload ? JSON.stringify(payload) : "";

      const resolvedTenantId = context?.tenantId;
      const resolvedUserId = user?.sub;
      const resolvedRequestId = context?.requestId;

      const authHeaders = this.hmacService.createAuthHeaders({
        secret: env.INTELLIGENCE_SHARED_SECRET,
        method,
        path: endpoint,
        body: bodyStr,
        userId: resolvedUserId,
        tenantId: resolvedTenantId,
        requestId: resolvedRequestId,
      });

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: method === "POST" ? bodyStr : undefined,
        signal: AbortSignal.timeout(env.INTELLIGENCE_TIMEOUT_MS),
      });

      if (!response.ok) {
        return this.mapHttpError(response);
      }

      const data = (await response.json()) as T;
      return ok(data);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return err(new IntelligenceTimeoutError());
      }
      const message = error instanceof Error ? error.message : "Unknown gateway connection failure";
      this.logger.error(`Error communicating with Python intelligence service: ${message}`, error);
      return err(new IntelligenceUnavailableError(message));
    }
  }

  private async mapHttpError(response: Response): Promise<Result<never, IntelligenceError>> {
    let payload: PythonErrorPayload | undefined;
    try {
      payload = (await response.json()) as PythonErrorPayload;
    } catch {
      // Body not JSON or empty
    }

    const message = payload?.message || response.statusText;

    if (
      payload?.code === "AI_PAYLOAD_TOO_LARGE" ||
      payload?.code === "PAYLOAD_TOO_LARGE" ||
      response.status === 413
    ) {
      return err(new IntelligencePayloadTooLargeError(message));
    }

    if (payload?.code === "AI_INVALID_MODEL" || payload?.code === "INVALID_MODEL") {
      return err(new IntelligenceInvalidModelError(message));
    }

    if (payload?.code === "AI_UNAUTHORIZED" || response.status === 401 || response.status === 403) {
      return err(new IntelligenceUnauthorizedError(message));
    }

    if (payload?.code === "AI_RATE_LIMITED" || response.status === 429) {
      return err(new IntelligenceRateLimitError(message));
    }

    if (payload?.code === "AI_REQUEST_TIMEOUT" || response.status === 504) {
      return err(new IntelligenceTimeoutError(message));
    }

    if (payload?.code === "AI_SERVICE_UNAVAILABLE" || response.status >= 500) {
      return err(new IntelligenceUnavailableError(message));
    }

    return err(
      new IntelligenceUnavailableError(`Unexpected response: ${response.status} ${message}`),
    );
  }
}
