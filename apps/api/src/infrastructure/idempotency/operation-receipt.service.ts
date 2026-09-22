import { Injectable, Optional } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";

import { DatabaseService } from "../database";
import { MetricsService } from "../metrics/metrics.service";
import { OperationReceiptRepository } from "./repositories/operation-receipt.repository";

const DEFAULT_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECEIPT_RESULT_BYTES = 256 * 1024;

export interface OperationIdentity {
  operationId: string;
  operationType: string;
  scopeId: string;
  actorId?: string;
  tenantId?: string;
  requestHash: string;
  expiresAt?: Date;
}

export type OperationClaim =
  { state: "CLAIMED"; receiptId: string } | { state: "COMPLETED"; result: unknown };

export type OperationReceiptError = {
  type:
    | "TRANSACTION_REQUIRED"
    | "OPERATION_ID_REUSED"
    | "OPERATION_IN_PROGRESS"
    | "OPERATION_RESULT_TOO_LARGE";
};

/**
 * Durable business idempotency primitive. Claim, mutation, and complete must run
 * in the same DatabaseService transaction so a crash cannot commit only one.
 */
@Injectable()
export class OperationReceiptService {
  constructor(
    private readonly database: DatabaseService,
    private readonly receipts: OperationReceiptRepository,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async claim(identity: OperationIdentity): Promise<Result<OperationClaim, OperationReceiptError>> {
    if (!this.database.getTx()) return err({ type: "TRANSACTION_REQUIRED" });
    const receiptId = crypto.randomUUID();
    const created = await this.receipts.createIfAbsent({
      ...identity,
      id: receiptId,
      expiresAt: identity.expiresAt ?? new Date(Date.now() + DEFAULT_RECEIPT_TTL_MS),
    });
    if (created) {
      this.recordClaim("claimed");
      return ok({ state: "CLAIMED", receiptId });
    }

    const existing = await this.receipts.find(
      identity.operationType,
      identity.scopeId,
      identity.operationId,
    );
    if (!existing || existing.requestHash !== identity.requestHash) {
      return err({ type: "OPERATION_ID_REUSED" });
    }
    if (existing.status !== "COMPLETED") return err({ type: "OPERATION_IN_PROGRESS" });
    this.recordClaim("deduplicated");
    return ok({ state: "COMPLETED", result: existing.result });
  }

  async complete(
    receiptId: string,
    result: unknown,
    expiresAt?: Date,
  ): Promise<Result<void, OperationReceiptError>> {
    if (!this.database.getTx()) return err({ type: "TRANSACTION_REQUIRED" });
    if (!this.isStorableResult(result)) {
      return err({ type: "OPERATION_RESULT_TOO_LARGE" });
    }
    const completed = await this.receipts.complete(receiptId, result, expiresAt);
    return completed ? ok(undefined) : err({ type: "OPERATION_IN_PROGRESS" });
  }

  /** Releases a claim after a failed attempt so a durable worker can retry. */
  async release(receiptId: string): Promise<Result<void, OperationReceiptError>> {
    if (!this.database.getTx()) return err({ type: "TRANSACTION_REQUIRED" });
    await this.receipts.release(receiptId);
    return ok(undefined);
  }

  async releaseByOperationId(
    operationType: string,
    operationId: string,
  ): Promise<Result<void, OperationReceiptError>> {
    if (!this.database.getTx()) return err({ type: "TRANSACTION_REQUIRED" });
    await this.receipts.releaseByOperationId(operationType, operationId);
    return ok(undefined);
  }

  private isStorableResult(result: unknown): boolean {
    try {
      const encoded = JSON.stringify(result);
      return (
        typeof encoded === "string" &&
        Buffer.byteLength(encoded, "utf8") <= MAX_RECEIPT_RESULT_BYTES
      );
    } catch {
      return false;
    }
  }

  private recordClaim(state: "claimed" | "deduplicated"): void {
    this.metrics?.incrementCounter(
      "operation_receipt_claims_total",
      "Durable operation receipt claims",
      1,
      { state },
    );
  }
}
