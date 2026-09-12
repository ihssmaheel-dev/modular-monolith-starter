import { Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import {
  deviceTokens,
  notificationBatches,
  notificationPreferences,
  notifications,
  type DeviceTokenRow,
  type NotificationBatchRow,
  type NotificationRow,
  type PreferenceRow,
} from "./schemas/notification.schema";
import { Notification } from "../domain/entities/notification.entity";
import type { NotificationChannel } from "@repo/contracts";

@Injectable()
export class NotificationsRepository extends BaseRepository<Notification, NotificationRow> {
  // subject-scoped: every query filters by userId and subject_isolation RLS
  // backs it at the database layer. tenantId is display/audit context only.
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(notifications, database, tenantContext, false);
  }

  protected toDomain(row: NotificationRow): Notification {
    return Notification.fromPersistence({
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId,
      type: row.type,
      category: row.category,
      titleKey: row.titleKey,
      titleParams: (row.titleParams as Record<string, unknown> | null) ?? null,
      data: (row.data as Record<string, unknown> | null) ?? null,
      channels: (row.channels as NotificationChannel[]) ?? [],
      deliveredChannels: (row.deliveredChannels as NotificationChannel[]) ?? [],
      readAt: row.readAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async countUnread(userId: string): Promise<number> {
    const db = this.getDb();
    const result = await (
      db as unknown as { execute: (query: unknown) => Promise<{ rows: Array<{ count: string }> }> }
    ).execute(
      sql`select count(*) as count from notifications where user_id = ${userId} and read_at is null`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findDigestByBatchId(batchId: string): Promise<Result<Notification | null, never>> {
    const db = this.getDb();
    const result = await (
      db as unknown as { execute: (query: unknown) => Promise<{ rows: NotificationRow[] }> }
    ).execute(sql`select * from notifications where data->>'batchId' = ${batchId} limit 1`);
    const row = result.rows[0];
    return ok(row ? this.toDomain(row) : null);
  }

  async markAllRead(userId: string): Promise<void> {
    const db = this.getDb();
    await (
      db as unknown as {
        update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => Promise<void> } };
      }
    )
      .update(notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }

  async deleteByUser(userId: string): Promise<void> {
    const db = this.getDb();
    const deleter = db as unknown as {
      delete: (t: unknown) => { where: (c: unknown) => Promise<void> };
    };
    await deleter.delete(notifications).where(eq(notifications.userId, userId));
    await deleter.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    await deleter.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
    await deleter.delete(notificationBatches).where(eq(notificationBatches.userId, userId));
  }

  async deleteByTenant(tenantId: string): Promise<void> {
    const db = this.getDb();
    const deleter = db as unknown as {
      delete: (t: unknown) => { where: (c: unknown) => Promise<void> };
    };
    await deleter.delete(notifications).where(eq(notifications.tenantId, tenantId));
    await deleter.delete(notificationBatches).where(eq(notificationBatches.tenantId, tenantId));
  }

  async deleteUnscoped(): Promise<void> {
    const db = this.getDb();
    const deleter = db as unknown as {
      delete: (t: unknown) => { where: (c: unknown) => Promise<void> };
    };
    await deleter.delete(notifications).where(isNull(notifications.tenantId));
    await deleter.delete(notificationBatches).where(isNull(notificationBatches.tenantId));
  }
}

export type { NotificationRow, PreferenceRow, DeviceTokenRow, NotificationBatchRow };
