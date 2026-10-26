import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PrivacyRepository } from "./privacy.repository";
import { dsrRequests } from "../schemas/privacy.schema";

const DAY_MS = 24 * 60 * 60 * 1_000;
const OLDEST_REQUEST = new Date("1900-01-01T00:00:00Z");

describe("Privacy claims and worker fencing", () => {
  let pool: Pool;
  let client: PoolClient;
  let repository: PrivacyRepository;
  let requestId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    const db = drizzle(client);
    repository = new PrivacyRepository(
      { getDb: () => db, getTx: () => db } as unknown as DatabaseService,
      {
        get: () => ({ mode: "single" }),
        isSystemScope: () => true,
      } as unknown as TenantContextService,
    );
    requestId = randomUUID();
    await db.insert(dsrRequests).values({
      id: requestId,
      type: "EXPORT",
      subjectUserId: "privacy-test-user",
      tenantId: "privacy-test-tenant",
      expiresAt: new Date(Date.now() + DAY_MS),
      createdAt: OLDEST_REQUEST,
    });
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
    client.release();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("decodes claimed export identity and dates from the raw SQL result", async () => {
    const [claim] = await repository.claimExportBatch(1);

    expect(claim?.toJSON()).toMatchObject({
      id: requestId,
      subjectUserId: "privacy-test-user",
      tenantId: "privacy-test-tenant",
      status: "PROCESSING",
      attempts: 1,
      createdAt: OLDEST_REQUEST,
      updatedAt: expect.any(Date),
      lockedAt: expect.any(Date),
      expiresAt: expect.any(Date),
    });
    expect(claim?.isExpired()).toBe(false);
  });

  it("decodes claimed erasure identity, complete plan and dates", async () => {
    await drizzle(client)
      .update(dsrRequests)
      .set({
        type: "ACCOUNT_ERASURE",
        expiresAt: OLDEST_REQUEST,
        payload: { tenantIds: ["privacy-test-tenant"] },
      })
      .where(eq(dsrRequests.id, requestId));

    const [claim] = await repository.claimExpiredErasureBatch(1);

    expect(claim?.toJSON()).toMatchObject({
      id: requestId,
      subjectUserId: "privacy-test-user",
      tenantId: "privacy-test-tenant",
      payload: { tenantIds: ["privacy-test-tenant"] },
      attempts: 1,
      expiresAt: OLDEST_REQUEST,
      lockedAt: expect.any(Date),
      createdAt: OLDEST_REQUEST,
    });
    expect(claim?.isExpired()).toBe(true);
  });

  it("rejects completion and failure from an older lease after a reclaim", async () => {
    await repository.claimExportBatch(1);
    await drizzle(client)
      .update(dsrRequests)
      .set({ lockedAt: OLDEST_REQUEST })
      .where(eq(dsrRequests.id, requestId));
    const [newer] = await repository.claimExportBatch(1);
    expect(newer?.attempts).toBe(2);

    const expiry = new Date(Date.now() + DAY_MS);
    expect(
      await repository.completeExport(requestId, 1, { stale: true }, false, expiry),
    ).toMatchObject({ value: null });
    expect(await repository.markExportAttemptFailed(requestId, 1, true)).toMatchObject({
      value: null,
    });
    expect(
      await repository.completeExport(requestId, 2, { current: true }, false, expiry),
    ).toMatchObject({ value: { status: "READY" } });
    expect(await repository.markExportAttemptFailed(requestId, 2, true)).toMatchObject({
      value: null,
    });
  });

  it("does not resurrect an export after its request expiry", async () => {
    await repository.claimExportBatch(1);
    await drizzle(client)
      .update(dsrRequests)
      .set({ expiresAt: OLDEST_REQUEST })
      .where(eq(dsrRequests.id, requestId));

    expect(
      await repository.completeExport(requestId, 1, {}, false, new Date(Date.now() + DAY_MS)),
    ).toMatchObject({ value: null });
    expect(await repository.expireAbandonedExports()).toBeGreaterThanOrEqual(1);
    expect(await repository.markExportAttemptFailed(requestId, 1, false)).toMatchObject({
      value: null,
    });
  });

  it("allows an erasure finalization only once for its current claim", async () => {
    await drizzle(client)
      .update(dsrRequests)
      .set({ type: "ACCOUNT_ERASURE", expiresAt: OLDEST_REQUEST })
      .where(eq(dsrRequests.id, requestId));
    await repository.claimExpiredErasureBatch(1);

    expect(await repository.updateClaimed(requestId, 1, { status: "FULFILLED" })).toMatchObject({
      value: { status: "FULFILLED" },
    });
    expect(await repository.updateClaimed(requestId, 1, { status: "FAILED" })).toMatchObject({
      value: null,
    });
  });
});
