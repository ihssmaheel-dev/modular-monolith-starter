import { describe, expect, it } from "vitest";
import { hasPermission, matchesPermission, Permissions, resolveUserPermissions } from "./index";

describe("Permissions Engine", () => {
  describe("matchesPermission", () => {
    it("matches exact strings", () => {
      expect(matchesPermission("notes:create", "notes:create")).toBe(true);
      expect(matchesPermission("notes:create", "notes:delete")).toBe(false);
    });

    it("matches global wildcard * and admin", () => {
      expect(matchesPermission("*", "notes:create")).toBe(true);
      expect(matchesPermission("admin", "team:manage")).toBe(true);
    });

    it("matches namespace wildcard e.g. notes:*", () => {
      expect(matchesPermission("notes:*", "notes:create")).toBe(true);
      expect(matchesPermission("notes:*", "notes:delete")).toBe(true);
      expect(matchesPermission("notes:*", "files:read")).toBe(false);
    });

    it("matches legacy aliases e.g. notes:write", () => {
      expect(matchesPermission("notes:write", "notes:create")).toBe(true);
      expect(matchesPermission("notes:write", "notes:delete")).toBe(true);
      expect(matchesPermission("team:manage", "team:invite")).toBe(true);
    });
  });

  describe("hasPermission", () => {
    const userPerms = ["notes:read", "notes:create", "files:read"];

    it("evaluates mode all", () => {
      expect(hasPermission(userPerms, ["notes:read", "notes:create"], "all")).toBe(true);
      expect(hasPermission(userPerms, ["notes:read", "notes:delete"], "all")).toBe(false);
    });

    it("evaluates mode any", () => {
      expect(hasPermission(userPerms, ["notes:delete", "notes:read"], "any")).toBe(true);
      expect(hasPermission(userPerms, ["team:manage", "users:delete"], "any")).toBe(false);
    });

    it("returns true for empty required list", () => {
      expect(hasPermission(userPerms, [])).toBe(true);
    });
  });

  describe("resolveUserPermissions", () => {
    it("resolves admin role permissions", () => {
      const perms = resolveUserPermissions("admin");
      expect(perms).toContain(Permissions.USERS_DELETE);
      expect(perms).toContain(Permissions.TEAM_MANAGE);
    });

    it("resolves tenant member permissions", () => {
      const perms = resolveUserPermissions("user", "member");
      expect(perms).toContain(Permissions.NOTES_CREATE);
      expect(perms).toContain(Permissions.TEAM_READ);
      expect(perms).not.toContain(Permissions.TEAM_MANAGE);
    });

    it("resolves tenant admin permissions", () => {
      const perms = resolveUserPermissions("user", "admin");
      expect(perms).toContain(Permissions.TEAM_INVITE);
      expect(perms).toContain(Permissions.TEAM_MANAGE);
    });
  });
});
