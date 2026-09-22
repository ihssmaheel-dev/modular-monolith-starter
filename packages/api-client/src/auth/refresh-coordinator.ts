import { AuthResponseSchema, type AuthResponse } from "@repo/contracts";

import type { ApiClientOptions } from "../types";
import { readCookie } from "../utils";

const RPC_PATH = "/rpc";
const REFRESH_DEADLINE_MS = 10_000;
const LOCK_DEADLINE_MS = 5_000;
const LOCK_NAME = "app:auth:refresh_mutex";

export type RefreshOutcome =
  | { kind: "refreshed"; response: AuthResponse | null }
  | { kind: "invalid_session" }
  | { kind: "retryable_failure"; reason: "network" | "server" | "timeout" | "lock_timeout" }
  | { kind: "unsupported" }
  | { kind: "superseded" };

export interface RefreshCoordinator {
  refresh: () => Promise<RefreshOutcome>;
  handleFailure: () => Promise<void>;
}

interface BrowserLockManager {
  request<T>(
    name: string,
    options: { signal: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T>;
}

export function createRefreshCoordinator(
  baseUrl: string,
  options: ApiClientOptions,
): RefreshCoordinator {
  let pending: Promise<RefreshOutcome> | null = null;
  let failureNotified = false;

  return {
    refresh: () => {
      pending ??= coordinateRefresh(baseUrl, options).finally(() => {
        pending = null;
      });
      return pending;
    },
    handleFailure: async () => {
      if (failureNotified) return;
      failureNotified = true;
      queueMicrotask(() => {
        failureNotified = false;
      });
      await options.onAuthFailure?.();
    },
  };
}

async function coordinateRefresh(
  baseUrl: string,
  options: ApiClientOptions,
): Promise<RefreshOutcome> {
  const fingerprint = options.getAuthFingerprint?.();
  const accessToken = options.getAccessToken?.() ?? null;
  if (!isBrowserRuntime()) {
    return requestRefresh(baseUrl, options, fingerprint, accessToken);
  }

  const lockManager = browserLockManager();
  if (!lockManager) return { kind: "unsupported" };

  const lockAbort = new AbortController();
  const timer = setTimeout(() => lockAbort.abort(), LOCK_DEADLINE_MS);
  try {
    return await lockManager.request(LOCK_NAME, { signal: lockAbort.signal }, async () => {
      clearTimeout(timer);
      const changed = resolveChangedIdentity(options, fingerprint, accessToken);
      if (changed) return changed;
      return requestRefresh(baseUrl, options, fingerprint, accessToken);
    });
  } catch (error) {
    return isAbortError(error)
      ? { kind: "retryable_failure", reason: "lock_timeout" }
      : { kind: "retryable_failure", reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestRefresh(
  baseUrl: string,
  options: ApiClientOptions,
  expectedFingerprint = options.getAuthFingerprint?.(),
  previousAccessToken = options.getAccessToken?.() ?? null,
): Promise<RefreshOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_DEADLINE_MS);
  try {
    const csrf = readCookie("XSRF-TOKEN");
    const explicitRefreshToken = isBrowserRuntime() ? undefined : options.getRefreshToken?.();
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${RPC_PATH}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "accept-language": options.getLocale?.() ?? "en",
        ...(csrf ? { "x-xsrf-token": csrf } : {}),
      },
      body: JSON.stringify({ refreshToken: explicitRefreshToken ?? undefined }),
    });

    if ([400, 401, 403].includes(response.status)) return { kind: "invalid_session" };
    if (!response.ok) return { kind: "retryable_failure", reason: "server" };

    const parsed = AuthResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { kind: "retryable_failure", reason: "server" };

    const changed = resolveChangedIdentity(options, expectedFingerprint, previousAccessToken);
    if (changed) return changed;
    options.onAuthRefreshed?.(parsed.data);
    return { kind: "refreshed", response: parsed.data };
  } catch (error) {
    return isAbortError(error)
      ? { kind: "retryable_failure", reason: "timeout" }
      : { kind: "retryable_failure", reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function resolveChangedIdentity(
  options: ApiClientOptions,
  expectedFingerprint: string | undefined,
  previousAccessToken: string | null,
): RefreshOutcome | null {
  if (expectedFingerprint === undefined || options.getAuthFingerprint?.() === expectedFingerprint) {
    return null;
  }
  const currentAccessToken = options.getAccessToken?.() ?? null;
  return currentAccessToken && currentAccessToken !== previousAccessToken
    ? { kind: "refreshed", response: null }
    : { kind: "superseded" };
}

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function browserLockManager(): BrowserLockManager | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return null;
  const locks = navigator.locks as unknown as BrowserLockManager;
  return typeof locks.request === "function" ? locks : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
