import { describe, expect, it, beforeEach } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { AuthorizationService } from "./authorization.service";
import type { Principal } from "@repo/authorization";

describe("AuthorizationService", () => {
  let service: AuthorizationService;

  const alice: Principal = {
    id: "alice-1",
    email: "alice@test.com",
    role: "user",
    tenantId: "tenant-1",
    tenantRole: "member",
  };

  const bob: Principal = {
    id: "bob-2",
    email: "bob@test.com",
    role: "user",
    tenantId: "tenant-1",
    tenantRole: "member",
  };

  const note = {
    id: "note-100",
    type: "note",
    tenantId: "tenant-1",
    ownerId: "alice-1",
  };

  beforeEach(() => {
    service = new AuthorizationService();
    service.registerPolicies([
      {
        id: "note-owner",
        resourceType: "note",
        action: ["notes:read", "notes:update", "notes:delete"],
        effect: "ALLOW",
        condition: ({ principal, resource }) => resource?.ownerId === principal.id,
      },
    ]);
  });

  it("checks resource ownership via ReBAC policy", () => {
    const decision = service.check({
      principal: alice,
      action: "notes:update",
      resource: note,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("REBAC_RELATION");
  });

  it("denies non-owner non-admin member from mutating resource", () => {
    const decision = service.check({
      principal: bob,
      action: "notes:delete",
      resource: note,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("DEFAULT_DENY");
  });

  it("assert throws ForbiddenException on tenant mismatch", () => {
    const intruder: Principal = {
      ...alice,
      tenantId: "tenant-evil",
    };

    expect(() =>
      service.assert({
        principal: intruder,
        action: "notes:read",
        resource: note,
      }),
    ).toThrow(ForbiddenException);
  });

  it("registers dynamic policies at runtime", () => {
    service.registerPolicies([
      {
        id: "custom-vip-policy",
        action: "vip:access",
        effect: "ALLOW",
        condition: ({ principal }) => principal.email.endsWith("@test.com"),
      },
    ]);

    const decision = service.check({
      principal: alice,
      action: "vip:access",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("ABAC_POLICY");
    expect(decision.matchedPolicyId).toBe("custom-vip-policy");
  });

  it("denies owner access to actions that were not explicitly granted", () => {
    const decision = service.check({
      principal: alice,
      action: "notes:export",
      resource: note,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("DEFAULT_DENY");
  });
});
