import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { RequestOrganizationErasureCommand } from "./request-organization-erasure.command";
import type { AuthenticatedUser } from "@repo/contracts";

const OWNER = { sub: "user-1", email: "o@example.com", role: "user" } as AuthenticatedUser;
const MEMBER = { sub: "user-2", email: "m@example.com", role: "user" } as AuthenticatedUser;

function access(role: string) {
  return {
    organization: { data: { id: "org-1", name: "Acme" } },
    role,
  };
}

describe("RequestOrganizationErasureCommand", () => {
  let command: RequestOrganizationErasureCommand;
  let requests: { create: ReturnType<typeof vi.fn> };
  let listOrganizations: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    requests = { create: vi.fn().mockResolvedValue(ok({ id: "dsr-1" })) };
    listOrganizations = {
      execute: vi
        .fn()
        .mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 100, totalPages: 1 })),
    };
    const deleteOrganizationData = { execute: vi.fn().mockResolvedValue(ok(undefined)) };
    const purgeNotifications = { purgeTenant: vi.fn().mockResolvedValue(ok(undefined)) };
    const outbox = { dispatchGlobal: vi.fn().mockResolvedValue(ok(undefined)) };
    const events = { emitAsync: vi.fn().mockResolvedValue([]) };
    command = new RequestOrganizationErasureCommand(
      requests as never,
      listOrganizations as never,
      deleteOrganizationData as never,
      purgeNotifications as never,
      outbox as never,
      events as never,
    );
  });

  it("lets an owner erase with matching confirmation", async () => {
    listOrganizations.execute.mockResolvedValue(
      ok({ items: [access("owner")], total: 1, page: 1, limit: 100, totalPages: 1 }),
    );

    const result = await command.execute(OWNER, "org-1", "Acme");

    expect(result.isOk()).toBe(true);
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ORGANIZATION_ERASURE", tenantId: "org-1" }),
    );
  });

  it("forbids members and strangers even though the route guard cannot see tenant roles (H24)", async () => {
    listOrganizations.execute.mockResolvedValue(
      ok({ items: [access("member")], total: 1, page: 1, limit: 100, totalPages: 1 }),
    );

    const memberResult = await command.execute(MEMBER, "org-1", "Acme");
    expect(memberResult.isErr()).toBe(true);
    if (memberResult.isErr()) {
      expect(memberResult.error).toEqual({ type: "ORG_ERASE_FORBIDDEN" });
    }

    listOrganizations.execute.mockResolvedValue(
      ok({ items: [], total: 0, page: 1, limit: 100, totalPages: 1 }),
    );
    const strangerResult = await command.execute(MEMBER, "org-1", "Acme");
    expect(strangerResult.isErr()).toBe(true);
    expect(requests.create).not.toHaveBeenCalled();
  });

  it("finds ownership past the first membership page (H24)", async () => {
    const other = {
      organization: { data: { id: "org-9", name: "Other" } },
      role: "member",
    };
    listOrganizations.execute
      .mockResolvedValueOnce(ok({ items: [other], total: 2, page: 1, limit: 1, totalPages: 2 }))
      .mockResolvedValueOnce(
        ok({
          items: [{ organization: { data: { id: "org-1", name: "Acme" } }, role: "owner" }],
          total: 2,
          page: 2,
          limit: 1,
          totalPages: 2,
        }),
      );

    const result = await command.execute(OWNER, "org-1", "Acme");

    expect(result.isOk()).toBe(true);
    expect(listOrganizations.execute).toHaveBeenCalledTimes(2);
  });
});
