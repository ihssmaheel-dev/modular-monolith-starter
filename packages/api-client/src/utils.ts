import { AuthResponseSchema, type AuthResponse } from "@repo/contracts";
import { DEFAULT_PAGE_LIMIT, type PaginationQuery } from "@repo/contracts";
import type { ApiClientOptions } from "./types";

const RPC_PATH = "/rpc";

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getAuthorizationHeader(options: ApiClientOptions): string {
  const token = options.getAccessToken?.();
  return token ? `Bearer ${token}` : "";
}

export function getTransferHeaders(options: ApiClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "accept-language": options.getLocale?.() ?? "en",
    "idempotency-key": createIdempotencyKey(),
  };
  const authorization = getAuthorizationHeader(options);
  const tenantId = options.getTenantId?.();
  if (authorization) headers.authorization = authorization;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  const csrf = readCookie("XSRF-TOKEN");
  if (csrf) headers["x-xsrf-token"] = csrf;
  return headers;
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const encoded = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return encoded ? decodeURIComponent(encoded.slice(name.length + 1)) : null;
}

export function normalizePagination(query?: Partial<PaginationQuery>): PaginationQuery {
  return { page: query?.page ?? 1, limit: query?.limit ?? DEFAULT_PAGE_LIMIT };
}

export async function requestRefresh(
  baseUrl: string,
  options: ApiClientOptions,
): Promise<AuthResponse | null> {
  try {
    const csrf = readCookie("XSRF-TOKEN");
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${RPC_PATH}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "accept-language": options.getLocale?.() ?? "en",
        ...(csrf ? { "x-xsrf-token": csrf } : {}),
      },
      body: JSON.stringify({ refreshToken: options.getRefreshToken?.() ?? undefined }),
    });
    if (!response.ok) return null;
    const parsed = AuthResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface RefreshCoordinator {
  refresh: () => Promise<AuthResponse | null>;
  handleFailure: () => void;
  handleSuccess: (response: AuthResponse) => void;
}

/**
 * Single-flight refresh shared by both transports, with a deduped
 * auth-failure signal so N concurrent 401s cause one refresh and one logout.
 */
export function createRefreshCoordinator(
  baseUrl: string,
  options: ApiClientOptions,
): RefreshCoordinator {
  let pending: Promise<AuthResponse | null> | null = null;
  let failureNotified = false;
  return {
    refresh: () => {
      pending ??= requestRefresh(baseUrl, options).finally(() => {
        pending = null;
      });
      return pending;
    },
    handleFailure: () => {
      if (failureNotified) return;
      failureNotified = true;
      queueMicrotask(() => {
        failureNotified = false;
      });
      options.onAuthFailure?.();
    },
    handleSuccess: (response: AuthResponse) => {
      failureNotified = false;
      options.onAuthRefreshed?.(response);
    },
  };
}
