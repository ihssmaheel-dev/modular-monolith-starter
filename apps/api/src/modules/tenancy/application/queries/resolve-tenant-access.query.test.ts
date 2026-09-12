import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";

vi.mock("../../../../config/env", () => ({ env: { TENANCY_MODE: "multi" } }));

import { env } from "../../../../config/env";
import { Membership } from "../../domain/entities/tenancy.entity";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { ResolveTenantAccessQuery } from "./resolve-tenant-access.query";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";

describe("ResolveTenantAccessQuery", () => {
  let query: ResolveTenantAccessQuery;
  let memberships: MembershipsRepository;

  beforeEach(() => {
    env.TENANCY_MODE = "multi";
    memberships = { findMembership: vi.fn() } as unknown as MembershipsRepository;
    const database = {
      withResultTransaction: vi.fn().mockImplementation(async (callback) => callback()),
    } as unknown as DatabaseService;
    const tenantContext = {
      run: vi.fn((_context, callback) => callback()),
    } as unknown as TenantContextService;
    query = new ResolveTenantAccessQuery(memberships, database, tenantContext);
  });

  it("returns single mode without a membership lookup", async () => {
    env.TENANCY_MODE = "single";

    const result = await query.execute("user-1");

    expect(result).toMatchObject({ value: { mode: "single" } });
    expect(memberships.findMembership).not.toHaveBeenCalled();
  });

  it("requires a tenant header in multi-tenant mode", async () => {
    const result = await query.execute("user-1");

    expect(result).toMatchObject({ error: { type: "TENANT_REQUIRED" } });
  });

  it("rejects a user without a membership", async () => {
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(null));

    const result = await query.execute("user-1", "org-1");

    expect(result).toMatchObject({ error: { type: "MEMBERSHIP_NOT_FOUND" } });
  });

  it("returns the tenant context for a valid membership", async () => {
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(membership()));

    const result = await query.execute("user-1", "org-1");

    expect(result).toMatchObject({
      value: {
        mode: "multi",
        tenantId: "org-1",
        membershipId: "membership-1",
        role: "admin",
      },
    });
  });

  it("maps repository failures to membership not found", async () => {
    vi.mocked(memberships.findMembership).mockResolvedValue(err({ type: "CONFLICT" }) as never);

    const result = await query.execute("user-1", "org-1");

    expect(result).toMatchObject({ error: { type: "MEMBERSHIP_NOT_FOUND" } });
  });
});

function membership(): Membership {
  return Membership.fromPersistence({
    id: "membership-1",
    tenantId: "org-1",
    userId: "user-1",
    userEmail: "user@example.com",
    userName: "User",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
