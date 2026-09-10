import { HttpException, HttpStatus } from "@nestjs/common";
import {
  ApiErrorEnvelopeSchema,
  formatErrorRef,
  type ApiErrorEnvelope,
  type FieldErrors,
} from "@repo/contracts";
import { I18nService } from "../../infrastructure/i18n/i18n.service";
import { ZodValidationException } from "../exceptions/zod-validation.exception";
import { resolveRequestId } from "./request-id.utils";

const STATUS_KEYS: Record<number, string> = {
  400: "api.error.badRequest",
  401: "api.error.unauthorized",
  403: "api.error.forbidden",
  404: "api.error.notFound",
  409: "api.error.conflict",
  429: "api.error.rateLimited",
  503: "api.error.serviceUnavailable",
  500: "api.error.internal",
};
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

type ErrorPayload = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  i18nKey?: unknown;
  fieldErrors?: unknown;
  errors?: unknown;
  retry?: unknown;
};

export function createApiErrorEnvelope(
  exception: unknown,
  status: number,
  language: string | undefined,
  requestId: string,
  i18n: I18nService,
  traceId?: string,
): ApiErrorEnvelope {
  const safeStatus = normalizeStatus(status);
  const safeRequestId = resolveRequestId(requestId);
  const errorRef = formatErrorRef(traceId, safeRequestId);
  if (exception instanceof ZodValidationException) {
    return ApiErrorEnvelopeSchema.parse({
      code: "VALIDATION_FAILED",
      i18nKey: "api.error.validationFailed",
      message: i18n.t("api.error.validationFailed", language),
      status: HttpStatus.BAD_REQUEST,
      requestId: safeRequestId,
      ...(traceId ? { traceId } : {}),
      errorRef,
      fieldErrors: zodFieldErrors(exception, language, i18n),
    });
  }
  const payload = payloadOf(exception);
  const i18nKey = i18nKeyOf(payload, safeStatus);
  const retry = retryOf(payload, safeStatus);
  return ApiErrorEnvelopeSchema.parse({
    code: codeOf(payload, safeStatus),
    i18nKey,
    message: i18n.t(i18nKey, language),
    status: safeStatus,
    requestId: safeRequestId,
    ...(traceId ? { traceId } : {}),
    errorRef,
    fieldErrors: fieldErrorsOf(payload, language, i18n),
    ...(retry ? { retry } : {}),
  });
}

function zodFieldErrors(
  exception: ZodValidationException,
  language: string | undefined,
  i18n: I18nService,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of exception.zodError.issues) {
    const path = issue.path.join(".") || "root";
    errors[path] ??= [];
    const key = `zod.errors.${issue.code}`;
    const translated = i18n.t(key, language, issue as unknown as Record<string, string | number>);
    errors[path].push(
      translated === key ? i18n.t("api.error.validationFailed", language) : translated,
    );
  }
  return errors;
}

function payloadOf(exception: unknown): ErrorPayload | undefined {
  if (!(exception instanceof HttpException)) return undefined;
  const value = exception.getResponse();
  return typeof value === "object" && value !== null ? (value as ErrorPayload) : undefined;
}

function codeOf(payload: ErrorPayload | undefined, status: number): string {
  if (typeof payload?.code === "string" && isSafeCode(payload.code)) return payload.code;
  if (typeof payload?.error === "string" && /^[A-Z][A-Z0-9_]+$/.test(payload.error))
    return payload.error;
  return HttpStatus[status] ?? "INTERNAL_SERVER_ERROR";
}

function i18nKeyOf(payload: ErrorPayload | undefined, status: number): string {
  if (typeof payload?.i18nKey === "string" && isI18nKey(payload.i18nKey)) return payload.i18nKey;
  if (typeof payload?.message === "string" && isI18nKey(payload.message)) return payload.message;
  return STATUS_KEYS[status] ?? "api.error.internal";
}

function fieldErrorsOf(
  payload: ErrorPayload | undefined,
  language: string | undefined,
  i18n: I18nService,
): FieldErrors {
  const value = payload?.fieldErrors ?? payload?.errors;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const errors: FieldErrors = {};
  for (const [path, messages] of Object.entries(value)) {
    if (Array.isArray(messages) && messages.every((message) => typeof message === "string")) {
      errors[path] = messages.map((message) =>
        message.startsWith("api.") ? i18n.t(message, language) : message,
      );
    }
  }
  return errors;
}

function retryOf(payload: ErrorPayload | undefined, status: number): ApiErrorEnvelope["retry"] {
  if (typeof payload?.retry === "object" && payload.retry !== null) {
    const value = payload.retry as Record<string, unknown>;
    if (typeof value.retryable === "boolean") {
      const retryAfterMs = value.retryAfterMs;
      return {
        retryable: value.retryable,
        ...(isSafeRetryAfter(retryAfterMs) ? { retryAfterMs } : {}),
      };
    }
  }
  return RETRYABLE_STATUSES.has(status) ? { retryable: true } : undefined;
}

function normalizeStatus(status: number): number {
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function isSafeCode(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z][A-Za-z0-9_:-]*$/.test(value);
}

function isI18nKey(value: string): boolean {
  return value.length > 0 && value.length <= 256 && value.startsWith("api.");
}

function isSafeRetryAfter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
