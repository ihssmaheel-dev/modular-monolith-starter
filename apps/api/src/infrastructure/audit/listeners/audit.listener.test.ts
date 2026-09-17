import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditListener, DatabaseMutatedEvent } from "./audit.listener";
import { PinoLoggerService } from "../../logger/logger.service";
import { DatabaseService, TenantContextService } from "../../database";
import { ok } from "neverthrow";

describe("AuditListener", () => {
  let listener: AuditListener;
  let database: DatabaseService;
  let logger: PinoLoggerService;
  let tenantContext: TenantContextService;
  const event = new DatabaseMutatedEvent("notes", "note-1", "UPDATE", "user-1", "tenant-1", {}, {});
  const mockInsert = vi.fn();

  beforeEach(() => {
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    database = {
      getDb: vi.fn().mockReturnValue({ insert: vi.fn().mockReturnValue({ values: mockInsert }) }),
      getTx: vi.fn().mockReturnValue(undefined),
      withTransaction: vi.fn().mockImplementation(async (callback) => {
        await callback();
        return ok(undefined);
      }),
      withSystemScope: vi.fn().mockImplementation(async (callback) => callback()),
    } as unknown as DatabaseService;
    logger = {
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;
    tenantContext = {
      run: vi.fn().mockImplementation(async (_context, callback) => callback()),
      runSystem: vi.fn().mockImplementation(async (_context, callback) => callback()),
    } as unknown as TenantContextService;
    listener = new AuditListener(database, tenantContext, logger);
  });

  it("handles database.mutated with a tenant scope", async () => {
    await listener.handleDatabaseMutatedEvent(event);
    expect(tenantContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "multi", tenantId: "tenant-1" }),
      expect.any(Function),
    );
  });

  it("handles database.mutated with a system scope when tenant is missing", async () => {
    const systemEvent = new DatabaseMutatedEvent(
      "users",
      "user-1",
      "CREATE",
      undefined,
      undefined,
      {},
      {},
    );
    await listener.handleDatabaseMutatedEvent(systemEvent);
    expect(tenantContext.runSystem).toHaveBeenCalled();
  });

  it("handles authorization.denied by emitting an audit entry", async () => {
    await listener.handleAuthorizationDenied({
      decisionId: "dec-1",
      principalId: "user-1",
      action: "read",
      reason: "denied",
      tenantId: "tenant-1",
    });
    expect(tenantContext.run).toHaveBeenCalled();
  });
});
