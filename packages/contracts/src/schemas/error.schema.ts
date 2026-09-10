import { z } from "zod";

export const FieldErrorsSchema = z.record(z.string(), z.array(z.string()));

export const RetryMetadataSchema = z.object({
  retryable: z.boolean(),
  retryAfterMs: z.number().int().nonnegative().optional(),
});

export const ApiErrorEnvelopeSchema = z.object({
  code: z.string().min(1),
  i18nKey: z.string().min(1),
  message: z.string().min(1),
  status: z.number().int().min(400).max(599),
  requestId: z.string().min(1),
  traceId: z.string().optional(),
  errorRef: z.string().optional(),
  fieldErrors: FieldErrorsSchema,
  retry: RetryMetadataSchema.optional(),
});

export type FieldErrors = z.infer<typeof FieldErrorsSchema>;
export type RetryMetadata = z.infer<typeof RetryMetadataSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

/**
 * Derives a human-readable, 8-character hex error reference ID.
 * Prefers the first 8 characters of the OpenTelemetry trace ID (for immediate Jaeger / Loki lookup),
 * falling back to the leading 8 characters of the request ID UUID.
 */
export function formatErrorRef(traceId?: string, requestId?: string): string {
  if (typeof traceId === "string" && traceId.trim()) {
    const cleanTrace = traceId.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
    if (cleanTrace.length >= 8) return cleanTrace.slice(0, 8);
  }
  if (typeof requestId === "string" && requestId.trim()) {
    const firstGroup = requestId
      .split("-")[0]
      ?.replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
    if (firstGroup && firstGroup.length >= 8) return firstGroup.slice(0, 8);
    const cleanReq = requestId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (cleanReq.length >= 8) return cleanReq.slice(0, 8);
    if (cleanReq.length > 0) return cleanReq.padEnd(8, "0");
  }
  return "00000000";
}
