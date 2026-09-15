import type { ApiErrorEnvelope, AuthResponse } from "@repo/contracts";
import type { ZodType } from "zod";

export interface ApiClientOptions {
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
  getLocale?: () => string | null;
  getTenantId?: () => string | null;
  onAuthRefreshed?: (response: AuthResponse) => void;
  onAuthFailure?: () => void | Promise<void>;
}

export interface ApiResponse<T> {
  status: number;
  body: T;
  error?: ApiErrorEnvelope;
}

export type FetchFn = <T>(
  path: string,
  init?: RequestInit,
  schema?: ZodType<T>,
) => Promise<ApiResponse<T>>;
