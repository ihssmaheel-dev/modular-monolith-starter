import { describe, expect, it } from "vitest";
import {
  evaluateAuthorization,
  resolveResourceOwnerId,
  type Policy,
  type Principal,
} from "./index";

describe("Unified Authorization Engine (RBAC + ReBAC + ABAC)", () => {
  const alice: Principal = {
    id: "user-alice",
    email: "alice@example.com",
    role: "user",
    tenantId: "tenant-acme",
    tenantRole: "member",
    department: "engineering",
  };

  const bob: Principal = {
    id: "user-bob",
    email: "bob@example.com",
    role: "user",
    tenantId: "tenant-acme",
    tenantRole: "member",
    department: "sales",
  };

  const adminUser: Principal = {
    id: "user-admin",
    email: "admin@example.com",
    role: "admin",
  };

  const sampleNote = {
    id: "note-123",
    type: "note",
    tenantId: "tenant-acme",
    ownerId: "user-alice",
    department: "engineering",
  };

  it("1. Superadmin bypass: admin role allows any action", () => {
    const decision = evaluateAuthorization({
      principal: adminUser,
      action: "team:manage",
      resource: sampleNote,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("SUPERADMIN");
  });

  it("2. Tenant mismatch: denies cross-tenant access", () => {
    const intruder: Principal = {
      ...alice,
      tenantId: "tenant-other",
    };

    const decision = evaluateAuthorization({
      principal: intruder,
      action: "notes:read",
      resource: sampleNote,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("TENANT_MISMATCH");
  });

  it("3. ReBAC Ownership: owner can update their own resource", () => {
    const decision = evaluateAuthorization({
      principal: alice,
      action: "notes:update",
      resource: sampleNote,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("REBAC_RELATION");
  });

  it("4. ABAC Policy: allow matching department condition", () => {
    const departmentPolicy: Policy = {
      id: "department-match-policy",
      action: "notes:read",
      resourceType: "note",
      effect: "ALLOW",
      condition: ({ principal, resource }) =>
        resource?.attributes?.department === principal.department,
    };

    const decision = evaluateAuthorization(
      {
        principal: alice,
        action: "notes:read",
        resource: sampleNote,
      },
      [departmentPolicy],
    );

    expect(decision.allowed).toBe(true);
  });

  it("5. ABAC Explicit DENY: overrides ALLOW if condition matches", () => {
    const freezePolicy: Policy = {
      id: "freeze-edits-policy",
      action: "notes:update",
      resourceType: "note",
      effect: "DENY",
      condition: () => true, // completely frozen
    };

    const decision = evaluateAuthorization(
      {
        principal: alice,
        action: "notes:update",
        resource: sampleNote,
      },
      [freezePolicy],
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("EXPLICIT_DENY");
    expect(decision.matchedPolicyId).toBe("freeze-edits-policy");
  });

  it("6. RBAC Role fallback: member can read notes if in role", () => {
    const decision = evaluateAuthorization({
      principal: bob,
      action: "notes:read",
      resource: sampleNote,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("RBAC_ROLE");
  });

  it("7. Default DENY: denies unauthorized actions", () => {
    const decision = evaluateAuthorization({
      principal: bob,
      action: "team:manage",
      resource: sampleNote,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("DEFAULT_DENY");
  });

  it("normalizes module ownership fields consistently", () => {
    expect(resolveResourceOwnerId("note", { createdBy: "user-alice" })).toBe("user-alice");
    expect(resolveResourceOwnerId("file", { uploadedBy: "user-alice" })).toBe("user-alice");
  });

  it("derives ownership when a descriptor uses a module-specific field", () => {
    const decision = evaluateAuthorization({
      principal: alice,
      action: "notes:update",
      resource: { type: "note", id: "note-123", createdBy: "user-alice" },
    });
    expect(decision).toMatchObject({ allowed: true, reason: "REBAC_RELATION" });
  });
});
