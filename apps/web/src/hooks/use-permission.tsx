import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { hasPermission, resolveUserPermissions, type Permission } from "@repo/authorization";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { organizationsListQuery, tenancyStatusQuery } from "@/features/tenancy/tenancy.queries";

export function useUserPermissions(): Permission[] {
  const user = useAuthStore((state) => state.user);
  const tenantId = useTenantStore((state) => state.tenantId);

  const statusQuery = useQuery(tenancyStatusQuery());
  const isMultiTenant = statusQuery.data?.mode === "multi";

  const orgsQuery = useQuery({
    ...organizationsListQuery(),
    enabled: isMultiTenant && Boolean(tenantId),
  });

  const currentOrg = orgsQuery.data?.items?.find((o) => o.id === tenantId);
  const tenantRole = currentOrg?.role;

  return resolveUserPermissions(user?.role, tenantRole);
}

export function usePermission(
  required: Permission | Permission[],
  mode: "all" | "any" = "all",
): boolean {
  const permissions = useUserPermissions();
  return hasPermission(permissions, required, mode);
}

interface CanProps {
  permission: Permission | Permission[];
  mode?: "all" | "any";
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, mode = "all", fallback = null, children }: CanProps) {
  const allowed = usePermission(permission, mode);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
