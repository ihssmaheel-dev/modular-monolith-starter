import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PurgeExpiredErasuresCommand } from "./purge-expired-erasures.command";
import { PrivacyRepository } from "../../infrastructure/repositories/privacy.repository";
import { HardDeleteOrganizationCommand } from "../../../tenancy/application/commands/hard-delete-organization.command";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { DataLifecycleRegistry } from "../../../../infrastructure/lifecycle/data-lifecycle.registry";

function staleExport() {
  return DsrRequest.fromPersistence({
    id: "dsr-old",
    type: "EXPORT",
    status: "READY",
    subjectUserId: "user-1",
    payload: { exportedAt: new Date().toISOString() },
    expiresAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2025-12-01T00:00:00Z"),
    updatedAt: new Date("2025-12-01T00:00:00Z"),
  });
}

describe("PurgeExpiredErasuresCommand", () => {
  let command: PurgeExpiredErasuresCommand;
  let requests: PrivacyRepository;
  let deleteUser: { execute: ReturnType<typeof vi.fn> };
  let lifecycle: { purgeSubject: ReturnType<typeof vi.fn>; purgeTenant: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    requests = {
      findExpiredErasureBatch: vi.fn().mockResolvedValue([]),
      findExpiredExportBatch: vi.fn().mockResolvedValue([]),
      updateById: vi.fn(),
    } as unknown as PrivacyRepository;
    const deleteUserMock = { execute: vi.fn().mockResolvedValue(ok(undefined)) };
    deleteUser = deleteUserMock;
    const hardDeleteOrganization = {} as HardDeleteOrganizationCommand;
    lifecycle = {
      purgeSubject: vi.fn().mockResolvedValue(ok({ deleted: 0 })),
      purgeTenant: vi.fn().mockResolvedValue(ok({ deleted: 0 })),
    };
    const outbox = {
      dispatchGlobal: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as OutboxService;
    const events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const logger = {
      child: vi.fn().mockReturnValue({ error: vi.fn(), info: vi.fn() }),
    } as unknown as PinoLoggerService;
    const database = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => ok(await operation())),
      withResultTransaction: vi.fn((operation: () => Promise<unknown>) => operation()),
      emitAfterCommit: vi.fn(),
    } as unknown as DatabaseService;
    const tenantContext = {
      runSystem: vi.fn((_context: unknown, operation: () => unknown) => operation()),
      run: vi.fn((_context: unknown, operation: () => unknown) => operation()),
    } as unknown as TenantContextService;
    command = new PurgeExpiredErasuresCommand(
      requests,
      deleteUser as never,
      hardDeleteOrganization,
      lifecycle as unknown as DataLifecycleRegistry,
      outbox,
      events,
      logger,
      database,
      tenantContext,
    );
  });

  it("should scrub payloads of expired exports past their TTL", async () => {
    vi.mocked(requests.findExpiredExportBatch).mockResolvedValue([staleExport()]);
    vi.mocked(requests.updateById).mockResolvedValue(ok(staleExport()));

    const result = await command.execute();

    expect(result.isOk()).toBe(true);
    expect(requests.updateById).toHaveBeenCalledWith("dsr-old", {
      status: "EXPIRED",
      payload: null,
    });
  });

  it("should succeed when nothing expired", async () => {
    const result = await command.execute();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ purged: 0 });
    expect(requests.updateById).not.toHaveBeenCalled();
  });

  it("should purge registered lifecycle contributors before hard-deleting the user", async () => {
    const erasure = DsrRequest.fromPersistence({
      id: "dsr-erase",
      type: "ACCOUNT_ERASURE",
      status: "REQUESTED",
      subjectUserId: "user-9",
      payload: { tenantIds: [] },
      expiresAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
      updatedAt: new Date("2025-12-01T00:00:00Z"),
    });
    vi.mocked(requests.findExpiredErasureBatch).mockResolvedValue([erasure]);
    vi.mocked(requests.updateById).mockResolvedValue(ok(erasure));

    const result = await command.execute();

    expect(result.isOk()).toBe(true);
    expect(lifecycle.purgeSubject).toHaveBeenCalledWith("user-9", []);
    expect(deleteUser.execute).toHaveBeenCalledWith("user-9");
  });

  it("should fail closed when the persisted tenant plan is malformed", async () => {
    const erasure = DsrRequest.fromPersistence({
      id: "dsr-corrupt",
      type: "ACCOUNT_ERASURE",
      status: "REQUESTED",
      subjectUserId: "user-9",
      payload: { tenantIds: ["tenant-1", 42] },
      expiresAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
      updatedAt: new Date("2025-12-01T00:00:00Z"),
    });
    vi.mocked(requests.findExpiredErasureBatch).mockResolvedValue([erasure]);
    vi.mocked(requests.updateById).mockResolvedValue(ok(erasure));

    const result = await command.execute();

    expect(result.isOk()).toBe(true);
    expect(deleteUser.execute).not.toHaveBeenCalled();
    expect(requests.updateById).toHaveBeenCalledWith("dsr-corrupt", {
      status: "FAILED",
      payload: null,
    });
  });
});
