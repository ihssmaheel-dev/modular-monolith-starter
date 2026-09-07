import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { type Result } from "neverthrow";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import { notificationPreferences, type PreferenceRow } from "./schemas/notification.schema";
import {
  NotificationPreference,
  type NotificationPreferenceData,
} from "../domain/entities/notification-preference.entity";
import type { DigestCadence } from "@repo/contracts";

@Injectable()
export class PreferencesRepository extends BaseRepository<NotificationPreference, PreferenceRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(notificationPreferences, database, tenantContext, false);
  }

  protected toDomain(row: PreferenceRow): NotificationPreference {
    return NotificationPreference.fromPersistence({
      id: row.id,
      userId: row.userId,
      category: row.category,
      inApp: row.inApp,
      email: row.email,
      push: row.push,
      digestCadence: row.digestCadence as DigestCadence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findByUser(userId: string): Promise<Result<NotificationPreference[], never>> {
    return this.find({ userId });
  }

  async upsertDefaults(rows: NotificationPreferenceData[]): Promise<void> {
    const db = this.getDb();
    const existing = await this.findByUser(rows[0]?.userId ?? "__none__");
    const known = new Set(existing.isOk() ? existing.value.map((p) => p.category) : []);
    const missing = rows.filter((row) => !known.has(row.category));
    if (missing.length === 0) return;
    await (
      db as unknown as {
        insert: (t: unknown) => { values: (v: unknown) => Promise<void> };
      }
    )
      .insert(notificationPreferences)
      .values(
        missing.map((row) => ({
          id: row.id,
          userId: row.userId,
          category: row.category,
          inApp: row.inApp,
          email: row.email,
          push: row.push,
          digestCadence: row.digestCadence,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      );
  }

  async replaceAll(userId: string, rows: NotificationPreferenceData[]): Promise<void> {
    const db = this.getDb();
    const deleter = db as unknown as {
      delete: (t: unknown) => { where: (c: unknown) => Promise<void> };
      insert: (t: unknown) => { values: (v: unknown) => Promise<void> };
    };
    await deleter.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    if (rows.length > 0) {
      await deleter.insert(notificationPreferences).values(
        rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          category: row.category,
          inApp: row.inApp,
          email: row.email,
          push: row.push,
          digestCadence: row.digestCadence,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      );
    }
  }
}
