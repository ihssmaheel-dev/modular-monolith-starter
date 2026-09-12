import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";

import { DatabaseService } from "../../../../infrastructure/database";
import { Invitation, Membership } from "../../domain/entities/tenancy.entity";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { AcceptInvitationCommand } from "./accept-invitation.command";

const actor: AuthenticatedUser = {
  sub: "user-1",
  email: "invitee@example.com",
  name: "Invitee",
  role: "user",
};

describe("AcceptInvitationCommand", () => {
  let command: AcceptInvitationCommand;
  let invitations: InvitationsRepository;
  let memberships: MembershipsRepository;

  beforeEach(() => {
    invitations = {
      findByTokenHash: vi.fn(),
      markAccepted: vi.fn(),
    } as unknown as InvitationsRepository;
    memberships = { findMembership: vi.fn(), create: vi.fn() } as unknown as MembershipsRepository;
    const database = {
      withResultTransaction: vi.fn().mockImplementation(async (callback) => callback()),
      setTenantContext: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseService;
    command = new AcceptInvitationCommand(invitations, memberships, database);
  });

  it("rejects an invalid token", async () => {
    vi.mocked(invitations.findByTokenHash).mockResolvedValue(ok(null));

    const result = await command.execute("token", actor);

    expect(result).toMatchObject({ error: { type: "INVITATION_INVALID" } });
  });

  it("rejects a token issued for a different email", async () => {
    vi.mocked(invitations.findByTokenHash).mockResolvedValue(ok(invitation("other@example.com")));

    const result = await command.execute("token", actor);

    expect(result).toMatchObject({ error: { type: "INVITATION_EMAIL_MISMATCH" } });
  });

  it("does not duplicate an existing membership", async () => {
    vi.mocked(invitations.findByTokenHash).mockResolvedValue(ok(invitation(actor.email)));
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(membership()));

    const result = await command.execute("token", actor);

    expect(result).toMatchObject({ error: { type: "MEMBERSHIP_ALREADY_EXISTS" } });
  });

  it("creates a membership and accepts the invitation atomically", async () => {
    const created = membership();
    vi.mocked(invitations.findByTokenHash).mockResolvedValue(ok(invitation(actor.email)));
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(null));
    vi.mocked(memberships.create).mockResolvedValue(ok(created));
    vi.mocked(invitations.markAccepted).mockResolvedValue(ok(invitation(actor.email)));

    const result = await command.execute("token", actor);

    expect(result).toMatchObject({ value: created });
    expect(memberships.create).toHaveBeenCalledWith({
      tenantId: "org-1",
      userId: actor.sub,
      userEmail: actor.email,
      userName: actor.name,
      role: "member",
    });
    expect(invitations.markAccepted).toHaveBeenCalledWith("invite-1", actor.sub);
  });

  it("maps a failed acceptance to an invalid invitation", async () => {
    vi.mocked(invitations.findByTokenHash).mockResolvedValue(ok(invitation(actor.email)));
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(null));
    vi.mocked(memberships.create).mockResolvedValue(ok(membership()));
    vi.mocked(invitations.markAccepted).mockResolvedValue(ok(null));

    const result = await command.execute("token", actor);

    expect(result).toMatchObject({ error: { type: "INVITATION_INVALID" } });
  });

  it("maps lookup failures to a safe tenancy error", async () => {
    vi.mocked(invitations.findByTokenHash).mockResolvedValue(err({ type: "CONFLICT" }) as never);

    const result = await command.execute("token", actor);

    expect(result).toMatchObject({ error: { type: "TENANCY_OPERATION_FAILED" } });
  });
});

function invitation(email: string): Invitation {
  return Invitation.fromPersistence({
    id: "invite-1",
    tenantId: "org-1",
    email,
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function membership(): Membership {
  return Membership.fromPersistence({
    id: "member-1",
    tenantId: "org-1",
    userId: "user-1",
    userEmail: "invitee@example.com",
    userName: "Invitee",
    role: "member",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
