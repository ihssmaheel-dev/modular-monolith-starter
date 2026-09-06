import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ZodType } from "zod";
import type { ApiClientOptions, ApiResponse } from "./types";
import {
  createIdempotencyKey,
  getAuthorizationHeader,
  getTransferHeaders,
  readCookie,
  requestRefresh,
} from "./utils";
import {
  createAuthClient,
  createFilesClient,
  createNotesClient,
  createPrivacyClient,
  createTenancyClient,
  createUsersClient,
} from "./subclients";
import { createOrpcClient } from "./orpc";
import { invalidResponseError, parseError } from "./response";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApiClient(baseUrl: string, options: ApiClientOptions = {}) {
  let refreshPromise: Promise<unknown> = Promise.resolve(null);
  let isRefreshing = false;

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
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = requestRefresh(baseUrl, options).finally(() => {
          isRefreshing = false;
        });
      }
      const refreshed = await refreshPromise;
      if (!refreshed) {
        options.onAuthFailure?.();
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return { status: res.status, body: body as T, error: parseError(body) };
      }

      options.onAuthRefreshed?.(
        refreshed as Parameters<NonNullable<typeof options.onAuthRefreshed>>[0],
      );
      headers.authorization = `Bearer ${(refreshed as { accessToken: string }).accessToken}`;
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
        return {
          status: 502,
          body: null as T,
          error: invalidResponseError(),
        };
      }
      body = parsed.data;
    }

    return {
      status: res.status,
      body: body as T,
      ...(res.ok ? {} : { error: parseError(body) }),
    };
  };

  const orpcClient = createOrpcClient(baseUrl, options);
  const orpc = createTanstackQueryUtils(orpcClient);

  return {
    auth: createAuthClient(authenticatedFetch, orpcClient),
    files: createFilesClient(authenticatedFetch, orpcClient),
    notes: createNotesClient(authenticatedFetch, orpcClient),
    privacy: createPrivacyClient(authenticatedFetch, orpcClient),
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
