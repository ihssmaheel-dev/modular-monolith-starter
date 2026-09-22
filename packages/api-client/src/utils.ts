import { DEFAULT_PAGE_LIMIT, type PaginationQuery } from "@repo/contracts";
import type { ApiClientOptions } from "./types";

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getAuthorizationHeader(options: ApiClientOptions): string {
  const token = options.getAccessToken?.();
  return token ? `Bearer ${token}` : "";
}

export function getTransferHeaders(
  options: ApiClientOptions,
  isMutating = false,
): Record<string, string> {
  const headers: Record<string, string> = {
    "accept-language": options.getLocale?.() ?? "en",
  };
  if (isMutating) {
    headers["idempotency-key"] = createIdempotencyKey();
  }
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
