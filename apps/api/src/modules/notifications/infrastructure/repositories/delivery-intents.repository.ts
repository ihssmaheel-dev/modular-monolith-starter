import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NotificationChannel } from "@repo/contracts";
import { DatabaseService } from "../../../../infrastructure/database";
import {
  notificationDeliveryIntents,
  notifications,
  type NotificationDeliveryIntentRow,
} from "../schemas/notification.schema";

export interface NotificationDeliveryIntent {
  id: string;
  notificationId: string;
  userId: string;
  tenantId?: string;
  channel: "email" | "push";
  attempts: number;
}

@Injectable()
// subject-scoped: rows are internal delivery state keyed by a user-owned
// notification; only system workers traverse users or tenants.
export class DeliveryIntentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async createForNotification(
    notificationId: string,
    userId: string,
    tenantId: string | undefined,
    channels: NotificationChannel[],
  ): Promise<void> {
    const external = channels.filter((channel): channel is "email" | "push" => channel !== "inApp");
    if (external.length === 0) return;
    const db = this.database.getTx() ?? this.database.getDb();
    await db
      .insert(notificationDeliveryIntents)
      .values(
        external.map((channel) => ({
          id: randomUUID(),
          notificationId,
          userId,
          tenantId,
          channel,
        })),
      )
      .onConflictDoNothing();
  }

  async claimBatch(limit: number): Promise<NotificationDeliveryIntent[]> {
    const db = this.database.getTx() ?? this.database.getDb();
    const result = await db.execute(sql`WITH candidates AS (
      SELECT id FROM notification_delivery_intents
      WHERE (
        status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ) OR (
        status = 'processing' AND locked_at < NOW() - INTERVAL '2 minutes'
      )
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_delivery_intents
    SET status = 'processing', attempts = attempts + 1, locked_at = NOW(), updated_at = NOW()
    WHERE id IN (SELECT id FROM candidates)
    RETURNING
      id,
      notification_id AS "notificationId",
      user_id AS "userId",
      tenant_id AS "tenantId",
      channel,
      attempts`);
    return (result.rows as NotificationDeliveryIntentRow[]).map(toIntent);
  }

  async markDelivered(intent: NotificationDeliveryIntent): Promise<void> {
    const db = this.database.getTx() ?? this.database.getDb();
    await db
      .update(notificationDeliveryIntents)
      .set({ status: "delivered", lockedAt: null, lastError: null, updatedAt: new Date() })
      .where(eq(notificationDeliveryIntents.id, intent.id));
    await db.execute(sql`UPDATE notifications
      SET delivered_channels = CASE
        WHEN delivered_channels ? ${intent.channel} THEN delivered_channels
        ELSE delivered_channels || jsonb_build_array(${intent.channel})
      END,
      updated_at = NOW()
      WHERE id = ${intent.notificationId}`);
  }

  async getBacklogStats(): Promise<{ pending: number; dead: number; oldestPendingAt?: Date }> {
    const db = this.database.getTx() ?? this.database.getDb();
    const result = await db.execute(sql`SELECT
      COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS pending,
      COUNT(*) FILTER (WHERE status = 'dead')::int AS dead,
      MIN(created_at) FILTER (WHERE status IN ('pending', 'processing')) AS oldest_pending_at
      FROM notification_delivery_intents`);
    const row = result.rows[0] as
      { pending?: number; dead?: number; oldest_pending_at?: Date | string | null } | undefined;
    return {
      pending: Number(row?.pending ?? 0),
      dead: Number(row?.dead ?? 0),
      oldestPendingAt: toDate(row?.oldest_pending_at),
    };
  }

  async markFailed(
    intent: NotificationDeliveryIntent,
    error: string,
    maxAttempts: number,
  ): Promise<void> {
    const db = this.database.getTx() ?? this.database.getDb();
    const exhausted = intent.attempts >= maxAttempts;
    const delaySeconds = Math.min(900, 2 ** intent.attempts * 5);
    await db
      .update(notificationDeliveryIntents)
      .set({
        status: exhausted ? "dead" : "pending",
        lockedAt: null,
        lastError: error.slice(0, 1000),
        nextAttemptAt: exhausted ? null : new Date(Date.now() + delaySeconds * 1000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveryIntents.id, intent.id),
          eq(notificationDeliveryIntents.status, "processing"),
        ),
      );
  }

  async findNotification(intent: NotificationDeliveryIntent) {
    const db = this.database.getTx() ?? this.database.getDb();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, intent.notificationId))
      .limit(1);
    return rows[0] ?? null;
  }

  async deleteOldIntents(deliveredCutoff: Date, deadCutoff: Date, limit: number): Promise<number> {
    const db = this.database.getTx() ?? this.database.getDb();
    const result = await (
      db as unknown as { execute: (query: unknown) => Promise<{ rows: unknown[] }> }
    ).execute(sql`WITH candidates AS (
      SELECT id FROM notification_delivery_intents
      WHERE (status = 'delivered' AND updated_at < ${deliveredCutoff})
         OR (status = 'dead' AND updated_at < ${deadCutoff})
      ORDER BY updated_at ASC
      LIMIT ${limit}
    )
    DELETE FROM notification_delivery_intents
    WHERE id IN (SELECT id FROM candidates)
    RETURNING id`);
    return result.rows.length;
  }
}

function toIntent(row: NotificationDeliveryIntentRow): NotificationDeliveryIntent {
  return {
    id: row.id,
    notificationId: row.notificationId,
    userId: row.userId,
    tenantId: row.tenantId ?? undefined,
    channel: row.channel as "email" | "push",
    attempts: row.attempts,
  };
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
