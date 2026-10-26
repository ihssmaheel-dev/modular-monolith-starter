import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseService } from "../../../../infrastructure/database";
import {
  DeliveryIntentsRepository,
  type NotificationDeliveryIntent,
} from "./delivery-intents.repository";
import { notificationDeliveryIntents } from "../schemas/delivery-intents.schema";
import { notifications } from "../schemas/notifications.schema";

describe("Notification delivery attempt fencing", () => {
  let pool: Pool;
  let client: PoolClient;
  let repository: DeliveryIntentsRepository;
  let stale: NotificationDeliveryIntent;
  let current: NotificationDeliveryIntent;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenancy_mode', 'single', true)");
    await client.query("SELECT set_config('app.system_scope', 'true', true)");
    const db = drizzle(client);
    repository = new DeliveryIntentsRepository({
      getDb: () => db,
      getTx: () => db,
    } as unknown as DatabaseService);
    stale = {
      id: randomUUID(),
      notificationId: randomUUID(),
      userId: "notification-fencing-test-user",
      channel: "email",
      attempts: 1,
    };
    current = { ...stale, attempts: 2 };
    await db.insert(notifications).values({
      id: stale.notificationId,
      userId: stale.userId,
      type: "system",
      category: "system",
      titleKey: "notification.welcome",
      channels: ["email"],
    });
    // The second attempt has reclaimed the expired first attempt's lease.
    await db.insert(notificationDeliveryIntents).values({
      ...current,
      status: "processing",
      lockedAt: new Date(),
    });
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
    client.release();
  });

  afterAll(async () => {
    await pool.end();
  });

  async function readIntent() {
    const [row] = await drizzle(client)
      .select()
      .from(notificationDeliveryIntents)
      .where(eq(notificationDeliveryIntents.id, stale.id));
    return row;
  }

  it("rejects a stale success without changing delivered channels", async () => {
    expect(await repository.markDelivered(stale)).toBe(false);
    expect(await readIntent()).toMatchObject({ status: "processing", attempts: 2 });
    expect(await repository.findNotification(stale)).toMatchObject({ deliveredChannels: [] });
  });

  it("rejects stale failures before and after the current attempt succeeds", async () => {
    expect(await repository.markFailed(stale, "late failure", 5)).toBe(false);
    expect(await readIntent()).toMatchObject({ status: "processing", attempts: 2 });
    expect(await repository.markDelivered(current)).toBe(true);
    expect(await repository.markFailed(stale, "late failure", 5)).toBe(false);
    expect(await readIntent()).toMatchObject({ status: "delivered", attempts: 2 });
  });

  it("completes only once for the current claim and records its channel", async () => {
    expect(await repository.markDelivered(current)).toBe(true);
    expect(await repository.markDelivered(current)).toBe(false);
    expect(await repository.findNotification(current)).toMatchObject({
      deliveredChannels: ["email"],
    });
  });

  it("retries the current claim without allowing a late success to overwrite it", async () => {
    expect(await repository.markFailed(current, "temporary provider error", 5)).toBe(true);
    expect(await repository.markDelivered(current)).toBe(false);
    expect(await readIntent()).toMatchObject({ status: "pending", attempts: 2 });
  });
});
