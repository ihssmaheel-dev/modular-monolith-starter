import { createORPCClient } from "@orpc/client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { ApiErrorEnvelopeSchema, apiContract } from "@repo/contracts";
import type { ContractRouterClient } from "@orpc/contract";
import {
  createIdempotencyKey,
  createRefreshCoordinator,
  readCookie,
  type RefreshCoordinator,
} from "./utils";
import type { ApiClientOptions } from "./types";
import type { ApiResponse } from "./types";
import type { ZodType } from "zod";
import { invalidResponseError } from "./response";

const RPC_PATH = "/rpc";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createOrpcClient(
  baseUrl: string,
  options: ApiClientOptions = {},
  coordinator: RefreshCoordinator = createRefreshCoordinator(baseUrl, options),
) {
  const rpcUrl = `${baseUrl.replace(/\/+$/, "")}${RPC_PATH}`;

  const link = new OpenAPILink(apiContract, {
    url: rpcUrl,
    fetch: async (request) => {
      const headed = withHeaders(request, options);
      const initial = headed.clone();
      const response = await fetch(headed, { credentials: "include" });
      if (response.status !== 401 || !canRefreshRequest(request)) return response;

      const refreshed = await coordinator.refresh();
      if (!refreshed) {
        coordinator.handleFailure();
        return response;
      }

      coordinator.handleSuccess(refreshed);
      return fetch(withHeaders(initial, options, refreshed.accessToken), {
        credentials: "include",
      });
    },
  });

  return createORPCClient(link) as ContractRouterClient<typeof apiContract>;
}

export type OrpcClient = ContractRouterClient<typeof apiContract>;

export async function orpcResponse<T>(
  action: () => Promise<T>,
  successStatus: number,
  schema?: ZodType<T>,
): Promise<ApiResponse<T>> {
  try {
    const body = await action();
    const value = successStatus === 204 ? null : body;
    if (schema) {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        return { status: 502, body: null as T, error: invalidResponseError() };
      }
      return { status: successStatus, body: parsed.data };
    }
    return { status: successStatus, body: value as T };
  } catch (error) {
    const parsedError = parseError(error);
    return {
      status: readStatus(error),
      body: null as T,
      ...(parsedError ? { error: parsedError } : {}),
    };
  }
}

function parseError(error: unknown) {
  if (typeof error !== "object" || error === null || !("data" in error)) return undefined;
  const parsed = ApiErrorEnvelopeSchema.safeParse(error.data);
  return parsed.success ? parsed.data : undefined;
}

function withHeaders(request: Request, options: ApiClientOptions, accessToken?: string): Request {
  const headers = new Headers(request.headers);
  const token = accessToken ?? options.getAccessToken?.();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const tenantId = options.getTenantId?.();
  if (tenantId) headers.set("x-tenant-id", tenantId);
  headers.set("accept-language", options.getLocale?.() ?? "en");
  if (MUTATING_METHODS.has(request.method)) {
    if (!headers.has("idempotency-key")) headers.set("idempotency-key", createIdempotencyKey());
    if (!headers.has("x-xsrf-token")) {
      const csrf = readCookie("XSRF-TOKEN");
      if (csrf) headers.set("x-xsrf-token", csrf);
    }
  }
  return new Request(request, { headers, credentials: "include" });
}

function canRefreshRequest(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return path.endsWith(`${RPC_PATH}/auth/me`) || !path.includes(`${RPC_PATH}/auth/`);
}

function readStatus(error: unknown): number {
  if (typeof error !== "object" || error === null || !("status" in error)) return 500;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : 500;
}
