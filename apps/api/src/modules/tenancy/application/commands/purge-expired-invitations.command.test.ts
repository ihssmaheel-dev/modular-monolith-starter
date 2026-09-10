import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { InvitationsRepository } from "../../infrastructure/invitations.repository";
import { PurgeExpiredInvitationsCommand } from "./purge-expired-invitations.command";

describe("PurgeExpiredInvitationsCommand", () => {
  let command: PurgeExpiredInvitationsCommand;
  let invitations: InvitationsRepository;

  beforeEach(() => {
    invitations = {
      deleteSettledBefore: vi.fn().mockResolvedValue(0),
    } as unknown as InvitationsRepository;
    command = new PurgeExpiredInvitationsCommand(invitations);
  });

  it("stops after a short batch", async () => {
    vi.mocked(invitations.deleteSettledBefore).mockResolvedValue(12);

    const result = await command.execute(90);

    expect(result).toEqual(ok(12));
    expect(invitations.deleteSettledBefore).toHaveBeenCalledTimes(1);
    const [cutoff, limit] = vi.mocked(invitations.deleteSettledBefore).mock.calls[0] as [
      Date,
      number,
    ];
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(limit).toBe(500);
  });

  it("keeps purging full batches until drained", async () => {
    vi.mocked(invitations.deleteSettledBefore)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(3);

    const result = await command.execute(90);

    expect(result).toEqual(ok(1003));
    expect(invitations.deleteSettledBefore).toHaveBeenCalledTimes(3);
  });
});
