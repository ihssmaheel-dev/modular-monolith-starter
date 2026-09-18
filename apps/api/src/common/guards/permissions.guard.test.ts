import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { Permissions } from "@repo/authorization";
import { AuthorizationService } from "../../infrastructure/authorization";

function createMockContext(
  user?: { role: string; sub?: string },
  tenant?: { role?: string },
  requestInit?: { params?: Record<string, unknown>; body?: Record<string, unknown> },
) {
  const request = { user, tenant, params: requestInit?.params, body: requestInit?.body };
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as Parameters<PermissionsGuard["canActivate"]>[0];
}

describe("PermissionsGuard", () => {
  it.each(["admin", "user"])(
    "evaluates collection request policies for %s without an ID or tenant",
    (role) => {
      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue({ permissions: ["example:read"], mode: "all" }),
      } as unknown as Reflector;
      const authorization = new AuthorizationService();
      authorization.registerPolicies([
        {
          id: "example-request-access",
          resourceType: "request",
          action: "example:read",
          effect: "ALLOW",
          condition: ({ principal }) => principal.role === "admin" || principal.role === "user",
        },
      ]);
      const guard = new PermissionsGuard(reflector, authorization);

      expect(guard.canActivate(createMockContext({ role, sub: "user-1" }))).toBe(true);
      expect(() => guard.canActivate(createMockContext({ role: "guest", sub: "user-2" }))).toThrow(
        ForbiddenException,
      );
      expect(
        authorization.can({ id: "user-1", email: "user@example.test", role }, "example:read", {
          type: "example",
          id: "other-record",
        }),
      ).toBe(false);
    },
  );

  it("allows access when no permissions are required", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new AuthorizationService());
    const ctx = createMockContext();

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws ForbiddenException when user is not present", () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValue({ permissions: [Permissions.FILES_UPLOAD], mode: "all" }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new AuthorizationService());
    const ctx = createMockContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("allows access when user role has permission", () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValue({ permissions: [Permissions.FILES_UPLOAD], mode: "all" }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new AuthorizationService());
    const ctx = createMockContext({ role: "user" });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws ForbiddenException when user role lacks permission", () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValue({ permissions: [Permissions.USERS_DELETE], mode: "all" }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new AuthorizationService());
    const ctx = createMockContext({ role: "user" });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("allows admin access to all permissions", () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValue({ permissions: [Permissions.USERS_DELETE], mode: "all" }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new AuthorizationService());
    const ctx = createMockContext({ role: "admin" });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("allows access when tenant role grants permission", () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValue({ permissions: [Permissions.TEAM_MANAGE], mode: "all" }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new AuthorizationService());
    const ctx = createMockContext({ role: "user" }, { role: "admin" });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("denies forged ownership claims from the request body (C01)", () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValue({ permissions: [Permissions.USERS_WRITE], mode: "all" }),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new AuthorizationService());
    const ctx = createMockContext({ role: "user", sub: "attacker" }, undefined, {
      params: { id: "victim" },
      body: { ownerId: "attacker", email: "takeover@example.test" },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(reflector.getAllAndOverride).toHaveBeenCalled();
  });
});
