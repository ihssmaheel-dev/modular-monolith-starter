import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { FilesRepository } from "./files.repository";
import { files } from "../schemas/file.schema";

const DAY_MS = 24 * 60 * 60 * 1_000;
const pendingCutoff = new Date(Date.now() - DAY_MS);
const unlinkedCutoff = new Date(Date.now() - 7 * DAY_MS);

describe("File cleanup fencing", () => {
  let pool: Pool;
  let client: PoolClient;
  let repository: FilesRepository;
  let fileId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenancy_mode', 'single', true)");
    await client.query("SELECT set_config('app.system_scope', 'true', true)");
    const db = drizzle(client);
    repository = new FilesRepository(
      { getDb: () => db, getTx: () => db } as unknown as DatabaseService,
      {
        get: () => ({ mode: "single" }),
        isSystemScope: () => true,
      } as unknown as TenantContextService,
    );
    fileId = randomUUID();
    await db.insert(files).values({
      id: fileId,
      key: `cleanup-test/${fileId}`,
      fileName: "test.txt",
      contentType: "text/plain",
      fileSize: 4,
      bucket: "uploads",
      uploadedBy: "cleanup-test-user",
      status: "uploaded",
      activeKey: `cleanup-test/${fileId}.candidate-current`,
      scanCandidateKeys: [`cleanup-test/${fileId}.candidate-old`],
      createdAt: new Date(Date.now() - 8 * DAY_MS),
    });
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
    client.release();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("retains an orphan attached after candidate selection but before cleanup", async () => {
    const candidates = await repository.findUnlinkedBefore(unlinkedCutoff, true);
    expect(candidates.some((file) => file.id === fileId)).toBe(true);
    await repository.updateById(fileId, { parentType: "note", parentId: "parent-note" });

    expect(await repository.claimCleanup(fileId, pendingCutoff, unlinkedCutoff)).toBeNull();
    expect(await repository.findById(fileId)).toMatchObject({ value: { parentId: "parent-note" } });
  });

  it("prevents attachment after cleanup claims the object and preserves cleanup keys", async () => {
    const claim = await repository.claimCleanup(fileId, pendingCutoff, unlinkedCutoff);

    expect(claim?.activeKey).toBe(`cleanup-test/${fileId}.candidate-current`);
    expect(claim?.scanCandidateKeys).toEqual([`cleanup-test/${fileId}.candidate-old`]);
    expect(await repository.updateById(fileId, { parentId: "late-parent" })).toMatchObject({
      value: null,
    });
    expect(await repository.findById(fileId)).toMatchObject({ value: null });
  });

  it("does not claim a stale upload with a live scanner lease", async () => {
    await drizzle(client)
      .update(files)
      .set({
        status: "scanning",
        scanLeaseExpiresAt: new Date(Date.now() + DAY_MS),
      })
      .where(eq(files.id, fileId));

    expect(await repository.claimCleanup(fileId, pendingCutoff, unlinkedCutoff)).toBeNull();
  });

  it("keeps a failed deletion eligible for retry after a process restart", async () => {
    expect(await repository.claimCleanup(fileId, pendingCutoff, unlinkedCutoff)).not.toBeNull();

    const retry = await repository.findDeletedFiles(100, true);

    expect(retry.some((file) => file.id === fileId)).toBe(true);
    expect(await repository.claimCleanup(fileId, pendingCutoff, unlinkedCutoff)).not.toBeNull();
  });
});
