import { Injectable } from "@nestjs/common";
import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import { deviceTokens, type DeviceTokenRow } from "./schemas/notification.schema";
import type { DevicePlatform, DeviceProvider } from "@repo/contracts";

export interface DeviceToken {
  id: string;
  userId: string;
  platform: DevicePlatform;
  provider: DeviceProvider;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DeviceTokensRepository extends BaseRepository<DeviceToken, DeviceTokenRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(deviceTokens, database, tenantContext, false);
  }

  protected toDomain(row: DeviceTokenRow): DeviceToken {
    return {
      id: row.id,
      userId: row.userId,
      platform: row.platform as DevicePlatform,
      provider: row.provider as DeviceProvider,
      token: row.token,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByUser(userId: string): Promise<Result<DeviceToken[], never>> {
    return this.find({ userId });
  }

  async upsertToken(input: {
    userId: string;
    platform: string;
    provider: string;
    token: string;
  }): Promise<Result<DeviceToken, never>> {
    const db = this.getDb();
    const now = new Date();
    await (
      db as unknown as {
        insert: (t: unknown) => {
          values: (v: unknown) => {
            onConflictDoNothing: (o: unknown) => Promise<void>;
          };
        };
      }
    )
      .insert(deviceTokens)
      .values({
        id: randomUUID(),
        userId: input.userId,
        platform: input.platform,
        provider: input.provider,
        token: input.token,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [deviceTokens.userId, deviceTokens.token] });
    const found = await this.findOne({ userId: input.userId, token: input.token });
    if (found.isErr() || !found.value) return found as Result<DeviceToken, never>;
    const touched = await this.updateById(found.value.id, { lastSeenAt: new Date() });
    if (touched.isErr() || !touched.value) return ok(found.value);
    return ok(touched.value);
  }

  async deleteByUserAndToken(userId: string, token: string): Promise<boolean> {
    const found = await this.findOne({ userId, token });
    if (found.isErr() || !found.value) return false;
    const removed = await this.deleteById(found.value.id);
    return removed.isOk() && removed.value;
  }

  async deleteByUserAndId(userId: string, id: string): Promise<boolean> {
    const found = await this.findOne({ id, userId });
    if (found.isErr() || !found.value) return false;
    const removed = await this.deleteById(id);
    return removed.isOk() && removed.value;
  }

  async touchAll(userId: string): Promise<void> {
    const tokens = await this.findByUser(userId);
    if (tokens.isErr()) return;
    for (const token of tokens.value) {
      await this.updateById(token.id, { lastSeenAt: new Date() });
    }
  }

  async findStaleTokens(cutoff: Date, limit: number): Promise<DeviceToken[]> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<DeviceTokenRow[]> };
          };
        };
      }
    )
      .select()
      .from(deviceTokens)
      .where(and(lt(deviceTokens.lastSeenAt, cutoff), eq(deviceTokens.provider, "expo")))
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }
}
