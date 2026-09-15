import { getQueryClient } from "./query-client";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";

/** Clears every identity-bound state holder before credentials change. */
export async function clearIdentityBoundary(): Promise<void> {
  const queryClient = getQueryClient();
  await queryClient.cancelQueries();
  queryClient.clear();
  useTenantStore.getState().setTenantId(null);
  useAuthStore.getState().clearAuth();
}
