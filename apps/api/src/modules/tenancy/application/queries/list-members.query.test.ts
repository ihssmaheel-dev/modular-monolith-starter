import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";

import { TenantContextService } from "../../../../infrastructure/database";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { ListMembersQuery } from "./list-members.query";

describe("ListMembersQuery", () => {
  let query: ListMembersQuery;
  let memberships: MembershipsRepository;
  let context: TenantContextService;

  beforeEach(() => {
    memberships = { paginateForTenant: vi.fn() } as unknown as MembershipsRepository;
    context = { getRequiredTenantId: vi.fn() } as unknown as TenantContextService;
    query = new ListMembersQuery(memberships, context);
  });

  it("requires a tenant context", async () => {
    vi.mocked(context.getRequiredTenantId).mockReturnValue(null);

    const result = await query.execute(1, 20);

    expect(result).toMatchObject({ error: { type: "TENANT_REQUIRED" } });
  });

  it("delegates pagination with the active tenant", async () => {
    const page = {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    };
    vi.mocked(context.getRequiredTenantId).mockReturnValue("org-1");
    vi.mocked(memberships.paginateForTenant).mockResolvedValue(ok(page));

    const result = await query.execute(1, 20);

    expect(result).toMatchObject({ value: page });
    expect(memberships.paginateForTenant).toHaveBeenCalledWith("org-1", { page: 1, limit: 20 });
  });
});
