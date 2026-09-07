import { Injectable } from "@nestjs/common";
import { and, eq, lte } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import { notificationBatches, type NotificationBatchRow } from "./schemas/notification.schema";

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
    const found = await this.findById(id);
    if (found.isErr() || !found.value || found.value.status !== "open") return ok(null);
    const items = [...found.value.items, item].slice(-maxItems);
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
            where: (c: unknown) => { limit: (n: number) => Promise<NotificationBatchRow[]> };
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
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }
}
