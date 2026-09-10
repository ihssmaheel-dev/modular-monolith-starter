import { ApiErrorEnvelopeSchema, formatErrorRef, type ApiErrorEnvelope } from "@repo/contracts";

export function invalidResponseError(requestId = "client"): ApiErrorEnvelope {
  return {
    code: "INVALID_RESPONSE",
    i18nKey: "api.error.responseValidationFailed",
    message: "api.error.responseValidationFailed",
    status: 502,
    requestId,
    errorRef: formatErrorRef(undefined, requestId),
    fieldErrors: {},
  };
}

export function parseError(
  value: unknown,
  headers?: Headers,
  status?: number,
): ApiErrorEnvelope | undefined {
  const direct = ApiErrorEnvelopeSchema.safeParse(value);
  if (direct.success) return direct.data;
  if (typeof value === "object" && value !== null && "data" in value) {
    const nested = ApiErrorEnvelopeSchema.safeParse(value.data);
    if (nested.success) return nested.data;
  }
  if (headers) {
    const traceId = headers.get("x-trace-id") ?? undefined;
    const requestId = headers.get("x-request-id") ?? undefined;
    const errorRef =
      headers.get("x-error-ref") ??
      (traceId || requestId ? formatErrorRef(traceId, requestId) : undefined);
    if (errorRef || requestId) {
      const safeStatus =
        typeof status === "number" && status >= 400 && status <= 599 ? status : 500;
      return {
        code: safeStatus >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED",
        i18nKey: "api.error.internal",
        message: "api.error.internal",
        status: safeStatus,
        requestId: requestId ?? "client",
        ...(traceId ? { traceId } : {}),
        errorRef: errorRef ?? formatErrorRef(traceId, requestId),
        fieldErrors: {},
      };
    }
  }
  return undefined;
}
