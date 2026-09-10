import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { env } from "../../../../config/env";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { PurgeExpiredInvitationsCommand } from "../commands/purge-expired-invitations.command";
import { InvitationRetentionWorker } from "./invitation-retention.worker";

describe("InvitationRetentionWorker", () => {
  const originalRole = env.PROCESS_ROLE;
  let purge: PurgeExpiredInvitationsCommand;
  let worker: InvitationRetentionWorker;

  beforeEach(() => {
    env.PROCESS_ROLE = "worker";
    purge = {
      execute: vi.fn().mockResolvedValue(ok(7)),
    } as unknown as PurgeExpiredInvitationsCommand;
    const logger = { child: vi.fn().mockReturnThis(), info: vi.fn(), error: vi.fn() };
    worker = new InvitationRetentionWorker(purge, logger as unknown as PinoLoggerService);
  });

  afterEach(() => {
    env.PROCESS_ROLE = originalRole;
  });

  it("purges through the command and reports the count", async () => {
    await expect(worker.purgeExpiredInvitations()).resolves.toBe(7);
    expect(purge.execute).toHaveBeenCalledOnce();
  });

  it("does not run in the API process", async () => {
    env.PROCESS_ROLE = "api";

    await expect(worker.purgeExpiredInvitations()).resolves.toBe(0);
    expect(purge.execute).not.toHaveBeenCalled();
  });

  it("absorbs command failures without throwing", async () => {
    vi.mocked(purge.execute).mockResolvedValue(err({ type: "TENANCY_OPERATION_FAILED" }));

    await expect(worker.purgeExpiredInvitations()).resolves.toBe(0);
  });
});
