import { describe, expect, it, vi, beforeEach } from "vitest";
import { MembershipUserListener } from "./membership-user.listener";
import { MembershipsRepository } from "../../infrastructure/memberships.repository";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { DatabaseService } from "../../../../infrastructure/database/database.service";

describe("MembershipUserListener", () => {
  let memberships: MembershipsRepository;
  let logger: PinoLoggerService;

  beforeEach(() => {
    vi.clearAllMocks();
    memberships = {
      updateUserSnapshot: vi.fn().mockResolvedValue(undefined),
      removeUser: vi.fn().mockResolvedValue(undefined),
    } as unknown as MembershipsRepository;
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;
  });

  it("runs snapshot updates inside a system scope when a database is available", async () => {
    const database = {
      withSystemScope: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    } as unknown as DatabaseService;
    const listener = new MembershipUserListener(memberships, logger, database);

    await listener.updateSnapshots({ userId: "user-1", changes: { name: "New Name" } });

    expect(database.withSystemScope).toHaveBeenCalledTimes(1);
    expect(memberships.updateUserSnapshot).toHaveBeenCalledWith("user-1", { name: "New Name" });
  });

  it("falls back to direct repository calls without a database", async () => {
    const listener = new MembershipUserListener(memberships, logger);

    await listener.removeMemberships({ userId: "user-1" } as never);

    expect(memberships.removeUser).toHaveBeenCalledWith("user-1");
  });
});
