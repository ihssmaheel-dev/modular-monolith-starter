import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";

vi.mock("../../../../config/env", () => ({ env: { TENANCY_MODE: "multi" } }));

import { env } from "../../../../config/env";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { CanDeleteUserQuery } from "./can-delete-user.query";

describe("CanDeleteUserQuery", () => {
  let query: CanDeleteUserQuery;
  let memberships: MembershipsRepository;

  beforeEach(() => {
    env.TENANCY_MODE = "multi";
    memberships = { hasOwnerMembership: vi.fn() } as unknown as MembershipsRepository;
    query = new CanDeleteUserQuery(memberships);
  });

  it("allows deletion in single-tenant mode without a membership lookup", async () => {
    env.TENANCY_MODE = "single";

    const result = await query.execute("user-1");

    expect(result.isOk()).toBe(true);
    expect(memberships.hasOwnerMembership).not.toHaveBeenCalled();
  });

  it("allows deletion when the user owns no organizations", async () => {
    vi.mocked(memberships.hasOwnerMembership).mockResolvedValue(ok(false));

    const result = await query.execute("user-1");

    expect(result.isOk()).toBe(true);
  });

  it("prevents deletion when the user owns an organization", async () => {
    vi.mocked(memberships.hasOwnerMembership).mockResolvedValue(ok(true));

    const result = await query.execute("user-1");

    expect(result).toMatchObject({ error: { type: "USER_OWNS_ORGANIZATION" } });
  });

  it("fails closed when ownership cannot be resolved", async () => {
    vi.mocked(memberships.hasOwnerMembership).mockResolvedValue(err({ type: "CONFLICT" }) as never);

    const result = await query.execute("user-1");

    expect(result).toMatchObject({ error: { type: "USER_OWNS_ORGANIZATION" } });
  });
});
