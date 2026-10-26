import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { OutboxService } from "./outbox.service";
import { OutboxRepository, type OutboxEvent } from "./repositories/outbox.repository";
import type { OutboxEventWorker } from "./workers/outbox-event.worker";
import { ok } from "neverthrow";
import type { DatabaseService, TenantContextService } from "../database";
import { env } from "../../config/env";
import { UserCreatedEvent } from "../../modules/users/domain/events/user.events";

describe("OutboxService", () => {
  let service: OutboxService;
  let repository: OutboxRepository;
  let tenantContext: TenantContextService;
  let database: DatabaseService;
  let eventWorker: OutboxEventWorker;
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
    eventWorker = {
      replayDeadLetter: vi.fn().mockResolvedValue(true),
    } as unknown as OutboxEventWorker;
    service = new OutboxService(repository, tenantContext, database, eventWorker);
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
        schemaVersion: 1,
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
      id: expect.any(String),
      tenantId: undefined,
      topic: "test.event",
      schemaVersion: 1,
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
        schemaVersion: 1,
        payload: {},
        status: "PENDING",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await service.dispatchGlobal("user.created", {
      userId: "user",
      email: "test@example.com",
      name: "Test",
      locale: "en",
    });

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

    await service.dispatchTenant("note.created", {
      noteId: "note",
      userId: "user",
      title: "Title",
      content: "Content",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", topic: "note.created" }),
    );
  });

  it("delegates dead-letter replay to the worker when available (H11)", async () => {
    const delegated = new OutboxService(repository, tenantContext, database, eventWorker);

    const result = await delegated.replayDeadLetter("event-1");

    expect(result.isOk()).toBe(true);
    expect(eventWorker.replayDeadLetter).toHaveBeenCalledWith("event-1");
  });

  it("fails a malformed event before committing a durable row", async () => {
    const result = await service.dispatchGlobal("user.created", { userId: "user" });
    expect(result).toMatchObject({ error: { type: "OUTBOX_INVALID_EVENT" } });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("validates class-based domain events using the plain persisted payload", async () => {
    vi.mocked(repository.create).mockResolvedValue(ok({} as OutboxEvent));
    const event = new UserCreatedEvent("user", "user@example.com", "User", "en");

    const result = await service.dispatchGlobal("user.created", event);

    expect(result.isOk()).toBe(true);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { userId: "user", email: "user@example.com", name: "User", locale: "en" },
      }),
    );
    expect(vi.mocked(repository.create).mock.calls[0]?.[0].payload).not.toBe(event);
  });

  it("rejects unsupported event versions at the producer boundary", async () => {
    const result = await service.dispatchGlobal("custom.event", { id: "value" }, 2);
    expect(result).toMatchObject({ error: { type: "OUTBOX_INVALID_EVENT" } });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("reports a missing dead letter without an incomplete SQL-only fallback", async () => {
    vi.mocked(eventWorker.replayDeadLetter).mockResolvedValue(false);

    const result = await service.replayDeadLetter("missing");

    expect(result).toMatchObject({ error: { type: "OUTBOX_NOT_FOUND" } });
  });
});
