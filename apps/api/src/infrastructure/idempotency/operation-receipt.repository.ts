import { Injectable } from "@nestjs/common";
import { and, eq, lt, sql } from "drizzle-orm";

import { DatabaseService } from "../database";
import { operationReceipts, type OperationReceiptRow } from "./schemas/operation-receipt.schema";

export interface NewOperationReceipt {
  id: string;
  operationId: string;
  operationType: string;
  scopeId: string;
  actorId?: string;
  tenantId?: string;
  requestHash: string;
  expiresAt: Date;
}

@Injectable()
export class OperationReceiptRepository {
  constructor(private readonly database: DatabaseService) {}

  async createIfAbsent(receipt: NewOperationReceipt): Promise<boolean> {
    const db = this.database.getTx();
    if (!db) return false;
    const inserted = await db
      .insert(operationReceipts)
      .values(receipt)
      .onConflictDoUpdate({
        target: [
          operationReceipts.operationType,
          operationReceipts.scopeId,
          operationReceipts.operationId,
        ],
        set: {
          id: receipt.id,
          actorId: receipt.actorId,
          tenantId: receipt.tenantId,
          requestHash: receipt.requestHash,
          status: "PROCESSING",
          result: null,
          expiresAt: receipt.expiresAt,
          createdAt: new Date(),
          completedAt: null,
        },
        setWhere: and(
          eq(operationReceipts.status, "PROCESSING"),
          lt(operationReceipts.expiresAt, new Date()),
        ),
      })
      .returning({ id: operationReceipts.id });
    return inserted.length === 1;
  }

  async find(operationType: string, scopeId: string, operationId: string) {
    const db = this.database.getTx();
    if (!db) return undefined;
    const rows = await db
      .select()
      .from(operationReceipts)
      .where(
        and(
          eq(operationReceipts.operationType, operationType),
          eq(operationReceipts.scopeId, scopeId),
          eq(operationReceipts.operationId, operationId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async complete(id: string, result: unknown, expiresAt?: Date): Promise<boolean> {
    const db = this.database.getTx();
    if (!db) return false;
    const rows = await db
      .update(operationReceipts)
      .set({
        status: "COMPLETED",
        result,
        completedAt: new Date(),
        ...(expiresAt ? { expiresAt } : {}),
      })
      .where(and(eq(operationReceipts.id, id), eq(operationReceipts.status, "PROCESSING")))
      .returning({ id: operationReceipts.id });
    return rows.length === 1;
  }

  async release(id: string): Promise<boolean> {
    const db = this.database.getTx();
    if (!db) return false;
    const rows = await db
      .delete(operationReceipts)
      .where(and(eq(operationReceipts.id, id), eq(operationReceipts.status, "PROCESSING")))
      .returning({ id: operationReceipts.id });
    return rows.length === 1;
  }

  async releaseByOperationId(operationType: string, operationId: string): Promise<boolean> {
    const db = this.database.getTx();
    if (!db) return false;
    const rows = await db
      .delete(operationReceipts)
      .where(
        and(
          eq(operationReceipts.operationType, operationType),
          eq(operationReceipts.operationId, operationId),
          eq(operationReceipts.status, "PROCESSING"),
        ),
      )
      .returning({ id: operationReceipts.id });
    return rows.length === 1;
  }

  async deleteExpired(limit: number): Promise<number> {
    const db = this.database.getTx() ?? this.database.getDb();
    const result = await db.execute(sql`WITH expired AS (
      SELECT id FROM operation_receipts
      WHERE expires_at < NOW()
      ORDER BY expires_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM operation_receipts WHERE id IN (SELECT id FROM expired)`);
    return result.rowCount ?? 0;
  }
}

export type { OperationReceiptRow };
