import { ConflictException } from "@nestjs/common";
import { env } from "../../config/env";
import {
  MILLISECONDS_PER_SECOND,
  type IdempotencyRecord,
  type RequestFingerprint,
} from "./idempotency.utils";

export function parseIdempotencyRecord(raw: string): IdempotencyRecord {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || (parsed.state !== "processing" && parsed.state !== "completed")) {
    throw new Error("invalid state");
  }
  if (!hasFingerprint(parsed)) {
    throw new Error("invalid fingerprint");
  }
  if (parsed.state === "processing" && isTimestamp(parsed.startedAt)) {
    return parsed as IdempotencyRecord;
  }
  if (
    parsed.state === "completed" &&
    isTimestamp(parsed.completedAt) &&
    isBodySize(parsed.bodyBytes) &&
    "body" in parsed
  ) {
    return parsed as IdempotencyRecord;
  }
  throw new Error("invalid record");
}

export function recordMatches(record: IdempotencyRecord, fingerprint: RequestFingerprint): boolean {
  return (
    record.fingerprint === fingerprint.digest &&
    record.method === fingerprint.method &&
    record.route === fingerprint.route &&
    record.path === fingerprint.path &&
    record.queryHash === fingerprint.queryHash &&
    record.bodyHash === fingerprint.bodyHash
  );
}

export function idempotencyConflict(code: string): ConflictException {
  const i18nKey =
    code === "IDEMPOTENCY_KEY_REUSED"
      ? "api.error.idempotencyConflict"
      : "api.error.idempotencyRecordInvalid";
  return new ConflictException({ code, i18nKey, fieldErrors: {} });
}

export function idempotencyInProgress(age: number): ConflictException {
  const remaining = Math.max(
    0,
    env.IDEMPOTENCY_STALE_AFTER_SECONDS - Math.floor(age / MILLISECONDS_PER_SECOND),
  );
  return new ConflictException({
    code: "IDEMPOTENCY_REQUEST_IN_PROGRESS",
    i18nKey: "api.error.idempotencyInProgress",
    fieldErrors: {},
    retry: { retryable: true, retryAfterMs: remaining * MILLISECONDS_PER_SECOND },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFingerprint(value: Record<string, unknown>): boolean {
  return [
    value.fingerprint,
    value.method,
    value.route,
    value.path,
    value.queryHash,
    value.bodyHash,
  ].every((item) => typeof item === "string" && item.length > 0);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isBodySize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
