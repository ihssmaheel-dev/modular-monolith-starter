export const Permissions = {
  // Users
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  USERS_DELETE: "users:delete",
  // Files
  FILES_READ: "files:read",
  FILES_UPLOAD: "files:upload",
  FILES_DELETE: "files:delete",
  FILES_WRITE: "files:write",
  // Organizations & Team
  ORGANIZATIONS_READ: "organizations:read",
  ORGANIZATIONS_WRITE: "organizations:write",
  ORGANIZATIONS_DELETE: "organizations:delete",
  TEAM_READ: "team:read",
  TEAM_INVITE: "team:invite",
  TEAM_MANAGE: "team:manage",
  TEAM_REMOVE: "team:remove",
  MEMBERS_READ: "members:read",
  MEMBERS_WRITE: "members:write",
  INVITATIONS_READ: "invitations:read",
  INVITATIONS_WRITE: "invitations:write",
  // Privacy (GDPR data-subject rights)
  PRIVACY_EXPORT_SELF: "privacy:export:self",
  PRIVACY_ERASE_SELF: "privacy:erase:self",
  PRIVACY_ERASE_TENANT: "privacy:erase:tenant",
  PRIVACY_REQUESTS_READ: "privacy:requests:read",
  // Notifications
  NOTIFICATIONS_READ: "notifications:read",
  NOTIFICATIONS_WRITE: "notifications:write",
} as const;

export type CorePermission = (typeof Permissions)[keyof typeof Permissions];
export type Permission = CorePermission | `${string}:${string}`;

const PERMISSION_PATTERN = /^[a-z][a-z0-9-]*(?::(?:[a-z][a-z0-9-]*|\*))+$/;

export const RolePermissions: Record<string, Permission[]> = {
  admin: [
    Permissions.USERS_READ,
    Permissions.USERS_WRITE,
    Permissions.USERS_DELETE,
    Permissions.FILES_READ,
    Permissions.FILES_UPLOAD,
    Permissions.FILES_DELETE,
    Permissions.ORGANIZATIONS_READ,
    Permissions.ORGANIZATIONS_WRITE,
    Permissions.ORGANIZATIONS_DELETE,
    Permissions.TEAM_READ,
    Permissions.TEAM_INVITE,
    Permissions.TEAM_MANAGE,
    Permissions.TEAM_REMOVE,
    Permissions.MEMBERS_READ,
    Permissions.MEMBERS_WRITE,
    Permissions.INVITATIONS_READ,
    Permissions.INVITATIONS_WRITE,
    Permissions.PRIVACY_EXPORT_SELF,
    Permissions.PRIVACY_ERASE_SELF,
    Permissions.PRIVACY_ERASE_TENANT,
    Permissions.PRIVACY_REQUESTS_READ,
    Permissions.NOTIFICATIONS_READ,
    Permissions.NOTIFICATIONS_WRITE,
  ],
  user: [
    Permissions.FILES_READ,
    Permissions.FILES_UPLOAD,
    Permissions.FILES_DELETE,
    Permissions.FILES_WRITE,
    Permissions.PRIVACY_EXPORT_SELF,
    Permissions.PRIVACY_ERASE_SELF,
    Permissions.NOTIFICATIONS_READ,
    Permissions.NOTIFICATIONS_WRITE,
  ],
};

export const TenantAdministrativePermissions: Permission[] = [
  Permissions.ORGANIZATIONS_READ,
  Permissions.ORGANIZATIONS_WRITE,
  Permissions.ORGANIZATIONS_DELETE,
  Permissions.TEAM_READ,
  Permissions.TEAM_INVITE,
  Permissions.TEAM_MANAGE,
  Permissions.TEAM_REMOVE,
  Permissions.MEMBERS_READ,
  Permissions.MEMBERS_WRITE,
  Permissions.INVITATIONS_READ,
  Permissions.INVITATIONS_WRITE,
  Permissions.FILES_READ,
  Permissions.FILES_UPLOAD,
  Permissions.FILES_DELETE,
  Permissions.PRIVACY_ERASE_TENANT,
  Permissions.NOTIFICATIONS_READ,
  Permissions.NOTIFICATIONS_WRITE,
];

const PLATFORM_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    Permissions.USERS_READ,
    Permissions.USERS_WRITE,
    Permissions.USERS_DELETE,
    Permissions.PRIVACY_EXPORT_SELF,
    Permissions.PRIVACY_ERASE_SELF,
    Permissions.PRIVACY_REQUESTS_READ,
  ],
  user: [Permissions.PRIVACY_EXPORT_SELF, Permissions.PRIVACY_ERASE_SELF],
};

export const TenantRolePermissions: Record<string, Permission[]> = {
  owner: TenantAdministrativePermissions,
  admin: [
    Permissions.ORGANIZATIONS_READ,
    Permissions.ORGANIZATIONS_WRITE,
    Permissions.TEAM_READ,
    Permissions.TEAM_INVITE,
    Permissions.TEAM_MANAGE,
    Permissions.TEAM_REMOVE,
    Permissions.MEMBERS_READ,
    Permissions.MEMBERS_WRITE,
    Permissions.INVITATIONS_READ,
    Permissions.INVITATIONS_WRITE,
    Permissions.FILES_READ,
    Permissions.FILES_UPLOAD,
    Permissions.FILES_DELETE,
    Permissions.FILES_WRITE,
    Permissions.PRIVACY_EXPORT_SELF,
    Permissions.PRIVACY_ERASE_SELF,
    Permissions.PRIVACY_ERASE_TENANT,
    Permissions.PRIVACY_REQUESTS_READ,
    Permissions.NOTIFICATIONS_READ,
    Permissions.NOTIFICATIONS_WRITE,
  ],
  member: [
    Permissions.ORGANIZATIONS_READ,
    Permissions.TEAM_READ,
    Permissions.MEMBERS_READ,
    Permissions.FILES_READ,
    Permissions.FILES_UPLOAD,
    Permissions.PRIVACY_EXPORT_SELF,
    Permissions.PRIVACY_ERASE_SELF,
    Permissions.NOTIFICATIONS_READ,
    Permissions.NOTIFICATIONS_WRITE,
  ],
};

export function matchesPermission(userPerm: string, requiredPerm: string): boolean {
  if (userPerm === "*" || userPerm === "admin" || userPerm === requiredPerm) return true;
  if (userPerm.endsWith(":*")) {
    const prefix = userPerm.slice(0, -1);
    if (requiredPerm.startsWith(prefix)) return true;
  }
  if (userPerm === "files:write") return requiredPerm === "files:upload";
  if (
    userPerm === "team:manage" &&
    (requiredPerm.startsWith("team:") ||
      requiredPerm.startsWith("members:") ||
      requiredPerm.startsWith("invitations:"))
  )
    return true;
  if (userPerm === "team:invite" && requiredPerm === "invitations:write") return true;
  if (userPerm === "invitations:write" && requiredPerm === "team:invite") return true;
  if (
    userPerm === "team:read" &&
    (requiredPerm === "members:read" || requiredPerm === "invitations:read")
  )
    return true;
  if (userPerm === "members:read" && requiredPerm === "team:read") return true;
  return false;
}

export function hasPermission(
  userPermissions: string[],
  required: Permission | Permission[] | string | string[],
  mode: "all" | "any" = "all",
): boolean {
  const reqs = Array.isArray(required) ? required : [required];
  if (reqs.length === 0) return true;
  if (mode === "any") {
    return reqs.some((req) => userPermissions.some((perm) => matchesPermission(perm, req)));
  }
  return reqs.every((req) => userPermissions.some((perm) => matchesPermission(perm, req)));
}

export function resolveUserPermissions(
  role?: string,
  tenantRole?: string,
  extraPermissions: string[] = [],
  scope: "global" | "tenant" = "global",
): Permission[] {
  const perms = new Set<Permission>();
  const roleMap = scope === "tenant" ? PLATFORM_ROLE_PERMISSIONS : RolePermissions;
  if (role && roleMap[role.toLowerCase()]) {
    for (const p of roleMap[role.toLowerCase()] ?? []) perms.add(p);
  }
  if (tenantRole && TenantRolePermissions[tenantRole.toLowerCase()]) {
    for (const p of TenantRolePermissions[tenantRole.toLowerCase()] ?? []) perms.add(p);
  }
  for (const p of extraPermissions) {
    if (PERMISSION_PATTERN.test(p)) perms.add(p as Permission);
  }
  return Array.from(perms);
}
