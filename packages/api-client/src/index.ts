import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ZodType } from "zod";
import type { ApiClientOptions, ApiResponse } from "./types";
import {
  createIdempotencyKey,
  createRefreshCoordinator,
  getAuthorizationHeader,
  getTransferHeaders,
  readCookie,
} from "./utils";
import {
  createAuthClient,
  createFilesClient,
  createNotesClient,
  createNotificationsClient,
  createPrivacyClient,
  createTenancyClient,
  createUsersClient,
} from "./subclients";
import { createOrpcClient } from "./orpc";
import { invalidResponseError, parseError } from "./response";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApiClient(baseUrl: string, options: ApiClientOptions = {}) {
  const coordinator = createRefreshCoordinator(baseUrl, options);

  const authenticatedFetch = async <T>(
    path: string,
    init: RequestInit = {},
    schema?: ZodType<T>,
  ): Promise<ApiResponse<T>> => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "accept-language": options.getLocale?.() ?? "en",
      ...((init.headers as Record<string, string>) ?? {}),
    };

    const auth = getAuthorizationHeader(options);
    if (auth && !headers.authorization) headers.authorization = auth;

    const tenantId = options.getTenantId?.();
    if (tenantId && !headers["x-tenant-id"]) headers["x-tenant-id"] = tenantId;

    if (MUTATING_METHODS.has(method) && !headers["idempotency-key"]) {
      headers["idempotency-key"] = createIdempotencyKey();
    }
    if (MUTATING_METHODS.has(method) && !headers["x-xsrf-token"]) {
      const csrf = readCookie("XSRF-TOKEN");
      if (csrf) headers["x-xsrf-token"] = csrf;
    }

    const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    let res = await fetch(url, { ...init, headers, credentials: "include" });

    const normalizedPath = path.replace(/^\/+/, "");
    const canRefresh = normalizedPath === "auth/me" || !normalizedPath.startsWith("auth/");
    if (res.status === 401 && canRefresh) {
      const refreshed = await coordinator.refresh();
      if (!refreshed) {
        coordinator.handleFailure();
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return {
          status: res.status,
          body: body as T,
          error: parseError(body, res.headers, res.status),
        };
      }

      coordinator.handleSuccess(refreshed);
      headers.authorization = `Bearer ${refreshed.accessToken}`;
      res = await fetch(url, { ...init, headers, credentials: "include" });
    }

    let body: unknown = null;
    if (res.status !== 204) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }

    if (res.ok && res.status !== 204 && schema) {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const reqId = res.headers.get("x-request-id") ?? "client";
        return {
          status: 502,
          body: null as T,
          error: invalidResponseError(reqId),
        };
      }
      body = parsed.data;
    }

    return {
      status: res.status,
      body: body as T,
      ...(res.ok ? {} : { error: parseError(body, res.headers, res.status) }),
    };
  };

  const orpcClient = createOrpcClient(baseUrl, options, coordinator);
  const orpc = createTanstackQueryUtils(orpcClient);

  return {
    auth: createAuthClient(authenticatedFetch, orpcClient),
    files: createFilesClient(authenticatedFetch, orpcClient),
    notes: createNotesClient(authenticatedFetch, orpcClient),
    privacy: createPrivacyClient(authenticatedFetch, orpcClient),
    notifications: createNotificationsClient(authenticatedFetch, orpcClient),
    tenancy: createTenancyClient(authenticatedFetch, orpcClient, options.getTenantId),
    users: createUsersClient(authenticatedFetch, orpcClient),
    orpc,
    client: orpcClient,
    getTransferHeaders: () => getTransferHeaders(options),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export * from "./types";
export * from "./utils";
export * from "./subclients";
export { createOrpcClient } from "./orpc";
export { createTanstackQueryUtils };
