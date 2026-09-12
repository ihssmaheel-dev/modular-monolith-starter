import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { OutboxService } from "./outbox.service";
import { OutboxRepository, type OutboxEvent } from "./outbox.repository";
import type { OutboxEventWorker } from "./outbox-event.worker";
import { ok } from "neverthrow";
import type { DatabaseService, TenantContextService } from "../database";
import { env } from "../../config/env";

describe("OutboxService", () => {
  let service: OutboxService;
  let repository: OutboxRepository;
  let tenantContext: TenantContextService;
  let database: DatabaseService;
  const originalMode = env.TENANCY_MODE;

  beforeEach(() => {
    env.TENANCY_MODE = "single";
    repository = {
      create: vi.fn(),
    } as unknown as OutboxRepository;

    tenantContext = {
      get: vi.fn().mockReturnValue({ mode: "single" }),
      isSystemScope: vi.fn().mockReturnValue(false),
    } as unknown as TenantContextService;
    database = {
      withSystemScope: vi.fn().mockImplementation(async (callback) => callback()),
    } as unknown as DatabaseService;
    service = new OutboxService(repository, tenantContext, database);
  });

  afterEach(() => {
    env.TENANCY_MODE = originalMode;
  });

  it("should create an outbox event with pending status", async () => {
    const now = new Date();
    vi.mocked(repository.create).mockResolvedValue(
      ok({
        id: "event-1",
        topic: "test.event",
        payload: { test: true },
        status: "PENDING",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const payload = { test: true };
    await service.dispatchTenant("test.event", payload);

    expect(repository.create).toHaveBeenCalledWith({
      tenantId: undefined,
      topic: "test.event",
      payload,
      status: "PENDING",
    });
  });

  it("writes a global event through trusted system scope", async () => {
    env.TENANCY_MODE = "multi";
    vi.mocked(tenantContext.get).mockReturnValue({ mode: "multi", tenantId: "tenant-1" });
    const now = new Date();
    vi.mocked(repository.create).mockResolvedValue(
      ok({
        id: "event-global",
        topic: "user.created",
        payload: {},
        status: "PENDING",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await service.dispatchGlobal("user.created", {});

    expect(database.withSystemScope).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined, topic: "user.created" }),
    );
  });

  it("requires tenant context for tenant events in multi-tenant mode", async () => {
    env.TENANCY_MODE = "multi";

    const result = await service.dispatchTenant("note.created", {});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toEqual({ type: "TENANT_SCOPE_REQUIRED" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("preserves the trusted tenant on tenant events", async () => {
    env.TENANCY_MODE = "multi";
    vi.mocked(tenantContext.get).mockReturnValue({ mode: "multi", tenantId: "tenant-1" });
    vi.mocked(repository.create).mockResolvedValue(ok({} as OutboxEvent));

    await service.dispatchTenant("note.created", {});

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", topic: "note.created" }),
    );
  });

  it("delegates dead-letter replay to the worker when available (H11)", async () => {
    const eventWorker = {
      replayDeadLetter: vi.fn().mockResolvedValue(true),
    } as unknown as OutboxEventWorker;
    const delegated = new OutboxService(repository, tenantContext, database, eventWorker);

    const result = await delegated.replayDeadLetter("event-1");

    expect(result.isOk()).toBe(true);
    expect(eventWorker.replayDeadLetter).toHaveBeenCalledWith("event-1");
  });

  it("falls back to row requeue without a worker", async () => {
    repository.requeueDeadLetter = vi.fn().mockResolvedValue(true);

    const result = await service.replayDeadLetter("event-1");

    expect(result.isOk()).toBe(true);
    expect(repository.requeueDeadLetter).toHaveBeenCalledWith("event-1");
  });
});
