import { formatErrorRef, type ApiErrorEnvelope } from "@repo/contracts";

export interface ErrorDetails {
  errorRef: string;
  traceId?: string;
  requestId?: string;
  status?: number;
  message?: string;
  timestamp: string;
}

export function extractErrorDetails(error: unknown): ErrorDetails {
  const timestamp = new Date().toISOString();
  const envelope = extractEnvelope(error);

  if (envelope) {
    const errorRef = envelope.errorRef ?? formatErrorRef(envelope.traceId, envelope.requestId);
    return {
      errorRef,
      traceId: envelope.traceId,
      requestId: envelope.requestId,
      status: envelope.status,
      message: envelope.message,
      timestamp,
    };
  }

  const rawMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : undefined;

  const clientHash = Math.random().toString(16).slice(2, 8);
  return {
    errorRef: `c-${clientHash}`,
    message: rawMessage,
    timestamp,
  };
}

function extractEnvelope(error: unknown): ApiErrorEnvelope | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  if ("code" in error && "requestId" in error && "status" in error) {
    return error as ApiErrorEnvelope;
  }
  if ("error" in error && typeof (error as { error?: unknown }).error === "object") {
    return extractEnvelope((error as { error?: unknown }).error);
  }
  if ("cause" in error && typeof (error as { cause?: unknown }).cause === "object") {
    return extractEnvelope((error as { cause?: unknown }).cause);
  }
  if ("data" in error && typeof (error as { data?: unknown }).data === "object") {
    return extractEnvelope((error as { data?: unknown }).data);
  }
  return undefined;
}

export function formatSupportClipboardText(details: ErrorDetails): string {
  const lines = [
    `Reference: #${details.errorRef}`,
    details.traceId ? `Trace ID: ${details.traceId}` : null,
    details.requestId ? `Request ID: ${details.requestId}` : null,
    details.status ? `Status: ${details.status}` : null,
    details.message ? `Message: ${details.message}` : null,
    `Timestamp: ${details.timestamp}`,
  ].filter(Boolean);
  return lines.join("\n");
}
