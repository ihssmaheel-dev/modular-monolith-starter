import { env } from "../../config/env";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import {
  FINALIZE_IDEMPOTENCY_SCRIPT,
  MILLISECONDS_PER_SECOND,
  RECOVER_IDEMPOTENCY_SCRIPT,
  RELEASE_IDEMPOTENCY_SCRIPT,
  type CompletedRecord,
  type ProcessingRecord,
  type RequestFingerprint,
} from "./idempotency.utils";
import {
  idempotencyConflict,
  idempotencyInProgress,
  parseIdempotencyRecord,
  recordMatches,
} from "./idempotency-record.utils";

export class IdempotencyStore {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly redisService: RedisService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "IdempotencyStore" });
  }

  isAvailable(): boolean {
    return this.redisService.getClient() !== null;
  }
  async claimOrRead(
    key: string,
    fingerprint: RequestFingerprint,
    attempt = 0,
  ): Promise<unknown | undefined> {
    const redis = this.redisService.getClient();
    if (!redis) return undefined;
    const now = Date.now();
    const processing: ProcessingRecord = {
      state: "processing",
      fingerprint: fingerprint.digest,
      method: fingerprint.method,
      route: fingerprint.route,
      path: fingerprint.path,
      queryHash: fingerprint.queryHash,
      bodyHash: fingerprint.bodyHash,
      startedAt: now,
    };
    const claimed = await redis.set(
      key,
      JSON.stringify(processing),
      "EX",
      env.IDEMPOTENCY_PROCESSING_TTL_SECONDS,
      "NX",
    );
    if (claimed) return undefined;
    const raw = await redis.get(key);
    if (!raw) return this.retryClaim(key, fingerprint, attempt);
    let record;
    try {
      record = parseIdempotencyRecord(raw);
    } catch (error) {
      this.logger.error({ key, error }, "Invalid cached idempotency record");
      throw idempotencyConflict("IDEMPOTENCY_RECORD_INVALID");
    }
    if (!recordMatches(record, fingerprint)) throw idempotencyConflict("IDEMPOTENCY_KEY_REUSED");
    if (record.state === "completed") return record.body;
    const age = now - record.startedAt;
    if (age < env.IDEMPOTENCY_STALE_AFTER_SECONDS * MILLISECONDS_PER_SECOND) {
      throw idempotencyInProgress(age);
    }
    const recovered = await redis.eval(
      RECOVER_IDEMPOTENCY_SCRIPT,
      1,
      key,
      raw,
      JSON.stringify(processing),
      env.IDEMPOTENCY_PROCESSING_TTL_SECONDS.toString(),
    );
    if (recovered === 1 || recovered === "1") return undefined;
    return this.retryClaim(key, fingerprint, attempt);
  }
  async cacheResponse(key: string, fingerprint: RequestFingerprint, body: unknown): Promise<void> {
    const redis = this.redisService.getClient();
    if (!redis) return;
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(body === undefined ? null : body);
    } catch (error) {
      this.logger.warn({ key, error }, "Idempotent response is not serializable");
      await this.release(key, fingerprint);
      return;
    }
    if (serialized === undefined) {
      this.logger.warn({ key }, "Idempotent response is not serializable");
      await this.release(key, fingerprint);
      return;
    }
    const bodyBytes = Buffer.byteLength(serialized, "utf8");
    if (bodyBytes > env.IDEMPOTENCY_MAX_RESPONSE_BYTES) {
      this.logger.warn({ key, bodyBytes }, "Idempotent response exceeds cache size limit");
      await this.release(key, fingerprint);
      return;
    }

    const record: CompletedRecord = {
      state: "completed",
      fingerprint: fingerprint.digest,
      method: fingerprint.method,
      route: fingerprint.route,
      path: fingerprint.path,
      queryHash: fingerprint.queryHash,
      bodyHash: fingerprint.bodyHash,
      body: body === undefined ? null : body,
      bodyBytes,
      completedAt: Date.now(),
    };
    try {
      const result = await redis.eval(
        FINALIZE_IDEMPOTENCY_SCRIPT,
        1,
        key,
        fingerprint.digest,
        JSON.stringify(record),
        env.IDEMPOTENCY_TTL_SECONDS.toString(),
      );
      if (result !== 1 && result !== "1") {
        this.logger.warn({ key }, "Idempotency lock ownership changed before completion");
      }
    } catch (error) {
      this.logger.error({ key, error }, "Failed to persist idempotent response");
      await this.release(key, fingerprint);
    }
  }
  async release(key: string, fingerprint: RequestFingerprint): Promise<void> {
    const redis = this.redisService.getClient();
    if (!redis) return;
    await redis
      .eval(RELEASE_IDEMPOTENCY_SCRIPT, 1, key, fingerprint.digest)
      .catch((error: unknown) => {
        this.logger.warn({ key, error }, "Failed to release idempotency lock");
      });
  }
  private async retryClaim(
    key: string,
    fingerprint: RequestFingerprint,
    attempt: number,
  ): Promise<unknown | undefined> {
    if (attempt >= 2) throw idempotencyConflict("IDEMPOTENCY_RECORD_INVALID");
    return this.claimOrRead(key, fingerprint, attempt + 1);
  }
}
