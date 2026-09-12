import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import type { Locale } from "@repo/i18n";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";

import { TenantContextService } from "../../../../infrastructure/database";
import { Invitation, Membership, Organization } from "../../domain/entities/tenancy.entity";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { OrganizationsRepository } from "../../infrastructure/repositories/organizations.repository";
import { InviteMemberCommand } from "./invite-member.command";

const actor: AuthenticatedUser = { sub: "owner-1", email: "owner@example.com", role: "user" };
const locale: Locale = "en";

describe("InviteMemberCommand", () => {
  let command: InviteMemberCommand;
  let invitations: InvitationsRepository;
  let memberships: MembershipsRepository;
  let organizations: OrganizationsRepository;
  let context: TenantContextService;
  let outbox: OutboxService;

  beforeEach(() => {
    invitations = {
      revokeExpired: vi.fn(),
      findPending: vi.fn(),
      create: vi.fn(),
    } as unknown as InvitationsRepository;
    memberships = { findByEmail: vi.fn() } as unknown as MembershipsRepository;
    organizations = { findById: vi.fn() } as unknown as OrganizationsRepository;
    context = {
      get: vi.fn().mockReturnValue({ tenantId: "org-1", role: "admin" }),
    } as unknown as TenantContextService;
    outbox = {
      dispatchTenant: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as OutboxService;
    command = new InviteMemberCommand(invitations, memberships, organizations, context, outbox);
  });

  it("requires an active tenant", async () => {
    vi.mocked(context.get).mockReturnValue({ mode: "multi" });

    const result = await command.execute(
      { email: "new@example.com", role: "member" },
      actor,
      locale,
    );

    expect(result).toMatchObject({ error: { type: "TENANT_REQUIRED" } });
  });

  it("requires an owner or admin role", async () => {
    vi.mocked(context.get).mockReturnValue({ mode: "multi", tenantId: "org-1", role: "member" });

    const result = await command.execute(
      { email: "new@example.com", role: "member" },
      actor,
      locale,
    );

    expect(result).toMatchObject({ error: { type: "TENANT_FORBIDDEN" } });
  });

  it("rejects an existing member", async () => {
    vi.mocked(memberships.findByEmail).mockResolvedValue(ok(membership()));

    const result = await command.execute(
      { email: "new@example.com", role: "member" },
      actor,
      locale,
    );

    expect(result).toMatchObject({ error: { type: "MEMBERSHIP_ALREADY_EXISTS" } });
  });

  it("rejects an existing pending invitation", async () => {
    vi.mocked(memberships.findByEmail).mockResolvedValue(ok(null));
    vi.mocked(invitations.findPending).mockResolvedValue(ok(invitation()));

    const result = await command.execute(
      { email: "new@example.com", role: "member" },
      actor,
      locale,
    );

    expect(result).toMatchObject({ error: { type: "INVITATION_ALREADY_EXISTS" } });
  });

  it("creates a lower-cased invitation and emits the email event", async () => {
    vi.mocked(memberships.findByEmail).mockResolvedValue(ok(null));
    vi.mocked(invitations.findPending).mockResolvedValue(ok(null));
    vi.mocked(organizations.findById).mockResolvedValue(ok(organization()));
    vi.mocked(invitations.create).mockResolvedValue(ok(invitation()));

    const result = await command.execute(
      { email: "NEW@EXAMPLE.COM", role: "member" },
      actor,
      locale,
    );

    expect(result.isOk()).toBe(true);
    expect(invitations.revokeExpired).toHaveBeenCalledWith("org-1", "new@example.com");
    expect(invitations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "org-1",
        email: "new@example.com",
        role: "member",
        invitedBy: actor.sub,
        status: "pending",
        tokenHash: expect.any(String),
      }),
    );
    expect(outbox.dispatchTenant).toHaveBeenCalledWith(
      "tenancy.invitation.created",
      expect.objectContaining({
        tenantId: "org-1",
        email: "new@example.com",
        organizationName: "Acme",
      }),
    );
  });

  it("maps repository failures to a safe tenancy error", async () => {
    vi.mocked(memberships.findByEmail).mockResolvedValue(err({ type: "CONFLICT" }) as never);

    const result = await command.execute(
      { email: "new@example.com", role: "member" },
      actor,
      locale,
    );

    expect(result).toMatchObject({ error: { type: "TENANCY_OPERATION_FAILED" } });
  });
});

function organization(): Organization {
  return Organization.fromPersistence({
    id: "org-1",
    name: "Acme",
    slug: "acme",
    createdBy: "owner-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function membership(): Membership {
  return Membership.fromPersistence({
    id: "member-1",
    tenantId: "org-1",
    userId: "user-1",
    userEmail: "new@example.com",
    userName: "New Member",
    role: "member",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function invitation(): Invitation {
  return Invitation.fromPersistence({
    id: "invite-1",
    tenantId: "org-1",
    email: "new@example.com",
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
