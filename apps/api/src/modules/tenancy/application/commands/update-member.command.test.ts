import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";

import { TenantContextService, type DatabaseService } from "../../../../infrastructure/database";
import { Membership } from "../../domain/entities/tenancy.entity";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { UpdateMemberCommand } from "./update-member.command";

describe("UpdateMemberCommand", () => {
  let command: UpdateMemberCommand;
  let memberships: MembershipsRepository;
  let context: TenantContextService;

  beforeEach(() => {
    memberships = {
      findMembership: vi.fn(),
      countOwners: vi.fn(),
      updateRole: vi.fn(),
    } as unknown as MembershipsRepository;
    context = {
      get: vi.fn().mockReturnValue({ tenantId: "org-1", role: "admin" }),
    } as unknown as TenantContextService;
    command = new UpdateMemberCommand(memberships, context);
  });

  it("does not allow an admin to change an owner role", async () => {
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(member("owner")));

    const result = await command.execute("user-2", "member");

    expect(result).toMatchObject({ error: { type: "TENANT_FORBIDDEN" } });
    expect(memberships.updateRole).not.toHaveBeenCalled();
  });

  it("does not allow removal of the last owner", async () => {
    vi.mocked(context.get).mockReturnValue({ mode: "multi", tenantId: "org-1", role: "owner" });
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(member("owner")));
    vi.mocked(memberships.countOwners).mockResolvedValue(ok(1));

    const result = await command.execute("user-2", "admin");

    expect(result).toMatchObject({ error: { type: "LAST_OWNER" } });
  });

  it("updates a role when the actor is allowed", async () => {
    const updated = member("admin");
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(member("member")));
    vi.mocked(memberships.updateRole).mockResolvedValue(ok(updated));

    const result = await command.execute("user-2", "admin");

    expect(result).toMatchObject({ value: updated });
    expect(memberships.updateRole).toHaveBeenCalledWith("org-1", "user-2", "admin");
  });

  it("returns not found when the membership no longer exists", async () => {
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(member("member")));
    vi.mocked(memberships.updateRole).mockResolvedValue(err({ type: "CONFLICT" }));

    const result = await command.execute("user-2", "admin");

    expect(result).toMatchObject({ error: { type: "MEMBERSHIP_NOT_FOUND" } });
  });

  it("serializes owner demotion on the organization lock before counting owners", async () => {
    const order: string[] = [];
    const database = {
      withResultTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      withAdvisoryLock: vi.fn(async (key: string, fn: () => Promise<unknown>) => {
        order.push(`lock:${key}`);
        return fn();
      }),
    } as unknown as DatabaseService;
    const locked = new UpdateMemberCommand(memberships, context, database);
    vi.mocked(context.get).mockReturnValue({ mode: "multi", tenantId: "org-1", role: "owner" });
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(member("owner")));
    vi.mocked(memberships.countOwners).mockImplementation(async () => {
      order.push("count");
      return ok(2);
    });
    vi.mocked(memberships.updateRole).mockResolvedValue(ok(member("member")));

    const result = await locked.execute("user-2", "member");

    expect(result.isOk()).toBe(true);
    expect(database.withAdvisoryLock).toHaveBeenCalledWith(
      "tenancy:owners:org-1",
      expect.any(Function),
    );
    expect(order).toEqual(["lock:tenancy:owners:org-1", "count"]);
  });

  it("skips the lock when the change cannot remove the last owner", async () => {
    const database = {
      withResultTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      withAdvisoryLock: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
    } as unknown as DatabaseService;
    const locked = new UpdateMemberCommand(memberships, context, database);
    vi.mocked(memberships.findMembership).mockResolvedValue(ok(member("member")));
    vi.mocked(memberships.updateRole).mockResolvedValue(ok(member("admin")));

    const result = await locked.execute("user-2", "admin");

    expect(result.isOk()).toBe(true);
    expect(database.withAdvisoryLock).not.toHaveBeenCalled();
  });
});

function member(role: "owner" | "admin" | "member"): Membership {
  return Membership.fromPersistence({
    id: "membership-2",
    tenantId: "org-1",
    userId: "user-2",
    userEmail: "member@example.com",
    userName: "Member",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
