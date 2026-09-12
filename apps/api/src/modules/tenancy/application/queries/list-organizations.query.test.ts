import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";

import { Membership, Organization } from "../../domain/entities/tenancy.entity";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { OrganizationsRepository } from "../../infrastructure/repositories/organizations.repository";
import { ListOrganizationsQuery } from "./list-organizations.query";

describe("ListOrganizationsQuery", () => {
  let query: ListOrganizationsQuery;
  let memberships: MembershipsRepository;
  let organizations: OrganizationsRepository;

  beforeEach(() => {
    memberships = { paginateForUser: vi.fn() } as unknown as MembershipsRepository;
    organizations = { findByIds: vi.fn() } as unknown as OrganizationsRepository;
    query = new ListOrganizationsQuery(memberships, organizations);
  });

  it("returns only organizations represented by the user memberships", async () => {
    vi.mocked(memberships.paginateForUser).mockResolvedValue(
      ok({
        items: [membership("org-1", "admin"), membership("missing", "member")],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    );
    vi.mocked(organizations.findByIds).mockResolvedValue(ok([organization("org-1")]));

    const result = await query.execute(actor(), 1, 20);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]).toMatchObject({ role: "admin" });
      expect(result.value.items[0]?.organization.data.id).toBe("org-1");
      expect(result.value.total).toBe(2);
    }
    expect(organizations.findByIds).toHaveBeenCalledWith(["org-1", "missing"]);
  });

  it("maps a membership lookup failure", async () => {
    vi.mocked(memberships.paginateForUser).mockResolvedValue(err({ type: "CONFLICT" }) as never);

    const result = await query.execute(actor(), 1, 20);

    expect(result).toMatchObject({ error: { type: "TENANCY_OPERATION_FAILED" } });
  });

  it("maps an organization lookup failure", async () => {
    vi.mocked(memberships.paginateForUser).mockResolvedValue(ok(emptyPage()));
    vi.mocked(organizations.findByIds).mockResolvedValue(err({ type: "CONFLICT" }) as never);

    const result = await query.execute(actor(), 1, 20);

    expect(result).toMatchObject({ error: { type: "TENANCY_OPERATION_FAILED" } });
  });
});

function actor(): AuthenticatedUser {
  return { sub: "user-1", email: "user@example.com", role: "user" };
}
function emptyPage() {
  return {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  };
}
function membership(tenantId: string, role: "admin" | "member"): Membership {
  return Membership.fromPersistence({
    id: `member-${tenantId}`,
    tenantId,
    userId: "user-1",
    userEmail: "user@example.com",
    userName: "User",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
function organization(id: string): Organization {
  return Organization.fromPersistence({
    id,
    name: "Acme",
    slug: "acme",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
