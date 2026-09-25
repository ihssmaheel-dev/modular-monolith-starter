import { Injectable, Logger } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import {
  ApiErrorEnvelopeSchema,
  type AuthenticatedUser,
  type SearchDocumentResult,
  type SearchDocumentsRequest,
  type UnaryChatRequest,
  type UnaryChatResponse,
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

const MAX_TENANT_BREAKERS = 500;

interface PythonErrorPayload {
  code?: string;
  i18nKey?: string;
  message?: string;
  status?: number;
  requestId?: string;
}

@Injectable()
export class IntelligenceGatewayService {
  private readonly logger = new Logger(IntelligenceGatewayService.name);
  private readonly breakers = new Map<string, CircuitBreaker<IntelligenceError>>();

  constructor(private readonly hmacService: IntelligenceHmacService) {}

  private getBreaker(tenantId?: string): CircuitBreaker<IntelligenceError> {
    const key = tenantId && tenantId.trim() ? tenantId.trim() : "__global__";
    let breaker = this.breakers.get(key);
    if (!breaker) {
      if (this.breakers.size >= MAX_TENANT_BREAKERS) {
        const oldestKey = this.breakers.keys().next().value;
        if (oldestKey) {
          this.breakers.delete(oldestKey);
        }
      }
      breaker = new CircuitBreaker(
        {
          failureThreshold: 3,
          resetTimeoutMs: 30_000,
          onStateChange: (state) => {
            this.logger.warn(
              `Intelligence circuit breaker (${key}) transitioned to state: ${state}`,
            );
          },
        },
        new IntelligenceUnavailableError("Intelligence circuit breaker is open"),
      );
      this.breakers.set(key, breaker);
    }
    return breaker;
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

    const breaker = this.getBreaker(options?.tenantId);
    return breaker.execute(async () => {
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

    const breaker = this.getBreaker(tenantId);
    return breaker.execute(async () => {
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
      const raw = await response.json();
      const parsed = ApiErrorEnvelopeSchema.safeParse(raw);
      payload = parsed.success ? parsed.data : (raw as PythonErrorPayload);
    } catch {
      // Body not JSON or empty
    }

    const message = payload?.message || response.statusText;
    const code = payload?.code;

    if (
      code === "AI_PAYLOAD_TOO_LARGE" ||
      code === "PAYLOAD_TOO_LARGE" ||
      response.status === 413
    ) {
      return err(new IntelligencePayloadTooLargeError(message));
    }

    if (code === "AI_INVALID_MODEL" || code === "INVALID_MODEL") {
      return err(new IntelligenceInvalidModelError(message));
    }

    if (code === "AI_UNAUTHORIZED" || response.status === 401 || response.status === 403) {
      return err(new IntelligenceUnauthorizedError(message));
    }

    if (code === "AI_RATE_LIMITED" || response.status === 429) {
      return err(new IntelligenceRateLimitError(message));
    }

    if (code === "AI_REQUEST_TIMEOUT" || response.status === 504) {
      return err(new IntelligenceTimeoutError(message));
    }

    if (code === "AI_SERVICE_UNAVAILABLE" || response.status >= 500) {
      return err(new IntelligenceUnavailableError(message));
    }

    return err(
      new IntelligenceUnavailableError(`Unexpected response: ${response.status} ${message}`),
    );
  }
}
