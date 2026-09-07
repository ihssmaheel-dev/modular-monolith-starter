import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PurgeExpiredErasuresCommand } from "./purge-expired-erasures.command";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";
import { DeleteUserCommand } from "../../../users/application/commands/delete-user.command";
import { HardDeleteOrganizationCommand } from "../../../tenancy/application/commands/hard-delete-organization.command";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DsrRequest } from "../../domain/entities/dsr.entity";

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

  beforeEach(() => {
    requests = {
      findExpiredErasureBatch: vi.fn().mockResolvedValue([]),
      findExpiredExportBatch: vi.fn().mockResolvedValue([]),
      updateById: vi.fn(),
    } as unknown as PrivacyRepository;
    const deleteUser = {} as DeleteUserCommand;
    const hardDeleteOrganization = {} as HardDeleteOrganizationCommand;
    const outbox = {} as OutboxService;
    const events = {} as unknown as EventEmitter2;
    const logger = {
      child: vi.fn().mockReturnValue({ error: vi.fn(), info: vi.fn() }),
    } as unknown as PinoLoggerService;
    command = new PurgeExpiredErasuresCommand(
      requests,
      deleteUser,
      hardDeleteOrganization,
      outbox,
      events,
      logger,
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
});
