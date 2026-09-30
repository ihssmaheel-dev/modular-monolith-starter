import { Injectable } from "@nestjs/common";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { notificationBatches, type NotificationBatchRow } from "../schemas/batches.schema";

export interface NotificationBatchItem {
  titleKey: string;
  titleParams?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface NotificationBatch {
  id: string;
  userId: string;
  tenantId?: string | null;
  type: string;
  groupingKey: string;
  items: NotificationBatchItem[];
  status: "open" | "delivered";
  windowEndsAt: Date;
}

@Injectable()
export class BatchesRepository extends BaseRepository<NotificationBatch, NotificationBatchRow> {
  // subject-scoped: every query filters by userId and subject_isolation RLS
  // backs it at the database layer. tenantId is display/audit context only.
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(notificationBatches, database, tenantContext, false);
  }

  protected toDomain(row: NotificationBatchRow): NotificationBatch {
    return {
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId,
      type: row.type,
      groupingKey: row.groupingKey,
      items: (row.items as NotificationBatchItem[]) ?? [],
      status: row.status as NotificationBatch["status"],
      windowEndsAt: row.windowEndsAt,
    };
  }

  async findOpenWindow(
    userId: string,
    groupingKey: string,
  ): Promise<Result<NotificationBatch | null, never>> {
    return this.findOne({ userId, groupingKey, status: "open" });
  }

  async appendToWindow(
    id: string,
    item: NotificationBatchItem,
    maxItems: number,
  ): Promise<Result<NotificationBatch | null, never>> {
    const db = this.getDb();
    const locked = await (
      db as unknown as { execute: (query: unknown) => Promise<{ rows: Array<{ items: unknown }> }> }
    ).execute(
      sql`SELECT items FROM notification_batches WHERE id = ${id} AND status = 'open' FOR UPDATE`,
    );
    if (locked.rows.length === 0) return ok(null);
    const current = (locked.rows[0]?.items as NotificationBatchItem[] | null) ?? [];
    const items = [...current, item].slice(-Math.max(1, maxItems));
    const updated = await this.updateOne({ id, status: "open" }, { items });
    if (updated.isErr()) return ok(null);
    return ok(updated.value);
  }

  async findDueWindows(limit: number): Promise<NotificationBatch[]> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => {
              orderBy: (...columns: unknown[]) => {
                limit: (n: number) => Promise<NotificationBatchRow[]>;
              };
            };
          };
        };
      }
    )
      .select()
      .from(notificationBatches)
      .where(
        and(
          eq(notificationBatches.status, "open"),
          lte(notificationBatches.windowEndsAt, new Date()),
        ),
      )
      .orderBy(asc(notificationBatches.windowEndsAt), asc(notificationBatches.id))
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  /** Locks one due window for this transaction; competing replicas skip it. */
  async lockDueWindow(id: string): Promise<NotificationBatch | null> {
    const result = await this.getDb().execute(sql`SELECT
      id,
      user_id AS "userId",
      tenant_id AS "tenantId",
      type,
      grouping_key AS "groupingKey",
      items,
      status,
      window_ends_at AS "windowEndsAt"
    FROM notification_batches
    WHERE id = ${id} AND status = 'open' AND window_ends_at <= NOW()
    FOR UPDATE SKIP LOCKED`);
    const row = result.rows[0] as
      (Omit<NotificationBatchRow, "windowEndsAt"> & { windowEndsAt: Date | string }) | undefined;
    if (!row) return null;
    const windowEndsAt =
      row.windowEndsAt instanceof Date ? row.windowEndsAt : new Date(row.windowEndsAt);
    return this.toDomain({ ...row, windowEndsAt } as NotificationBatchRow);
  }
}
