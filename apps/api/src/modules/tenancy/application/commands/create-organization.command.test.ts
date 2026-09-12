import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";

import { DatabaseService } from "../../../../infrastructure/database";
import { Membership, Organization } from "../../domain/entities/tenancy.entity";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { OrganizationsRepository } from "../../infrastructure/repositories/organizations.repository";
import { CreateOrganizationCommand } from "./create-organization.command";

const actor: AuthenticatedUser = {
  sub: "user-1",
  email: "owner@example.com",
  name: "Owner",
  role: "user",
};

describe("CreateOrganizationCommand", () => {
  let command: CreateOrganizationCommand;
  let organizations: OrganizationsRepository;
  let memberships: MembershipsRepository;

  beforeEach(() => {
    organizations = { findBySlug: vi.fn(), create: vi.fn() } as unknown as OrganizationsRepository;
    memberships = { create: vi.fn() } as unknown as MembershipsRepository;
    const database = {
      withSystemScope: vi.fn().mockImplementation(async (callback) => callback()),
      withResultTransaction: vi.fn().mockImplementation(async (callback) => callback()),
    } as unknown as DatabaseService;
    command = new CreateOrganizationCommand(organizations, memberships, database);
  });

  it("returns a conflict when the slug already exists", async () => {
    vi.mocked(organizations.findBySlug).mockResolvedValue(ok(organization()));

    const result = await command.execute({ name: "Acme", slug: "acme" }, actor);

    expect(result).toMatchObject({ error: { type: "ORGANIZATION_SLUG_TAKEN" } });
    expect(organizations.create).not.toHaveBeenCalled();
  });

  it("creates an organization and owner membership atomically", async () => {
    vi.mocked(organizations.findBySlug).mockResolvedValue(ok(null));
    vi.mocked(organizations.create).mockResolvedValue(ok(organization()));
    vi.mocked(memberships.create).mockResolvedValue(ok(membership()));

    const result = await command.execute({ name: "Acme Incorporated" }, actor);

    expect(result.isOk()).toBe(true);
    expect(organizations.create).toHaveBeenCalledWith({
      name: "Acme Incorporated",
      slug: "acme-incorporated",
      createdBy: actor.sub,
    });
    expect(memberships.create).toHaveBeenCalledWith({
      tenantId: "org-1",
      userId: actor.sub,
      userEmail: actor.email,
      userName: actor.name,
      role: "owner",
    });
  });

  it("maps repository failures to a safe tenancy error", async () => {
    vi.mocked(organizations.findBySlug).mockResolvedValue(err({ type: "CONFLICT" }) as never);

    const result = await command.execute({ name: "Acme" }, actor);

    expect(result).toMatchObject({ error: { type: "TENANCY_OPERATION_FAILED" } });
  });
});

function organization(): Organization {
  return Organization.fromPersistence({
    id: "org-1",
    name: "Acme Incorporated",
    slug: "acme-incorporated",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function membership(): Membership {
  return Membership.fromPersistence({
    id: "membership-1",
    tenantId: "org-1",
    userId: "user-1",
    userEmail: "owner@example.com",
    userName: "Owner",
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
