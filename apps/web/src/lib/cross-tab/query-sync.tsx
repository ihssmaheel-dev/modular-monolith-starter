import { useEffect } from "react";
import { broadcastQueryClient } from "@tanstack/query-broadcast-client-experimental";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { scopedChannel } from "./sync";

export const QUERY_SYNC_CHANNEL_BASE = "tanstack-query";

/**
 * Syncs this tab's query cache with same-identity tabs: one tab fetches,
 * the others apply the broadcast state without fetching.
 *
 * Safety notes (do not "simplify" these away):
 * - The channel is scoped per user + tenant. BroadcastChannel is
 *   origin-scoped, not user-scoped: a shared name would leak one user's
 *   cached data into another user's tab.
 * - Logged-out tabs never subscribe, so nothing can leak out either.
 * - Effect-only: never runs on the server, cleanup handles StrictMode/HMR.
 * - This is not leader election: two tabs mounting the same query in the
 *   same millisecond still fetch twice. It eliminates redundant refetches.
 */
export function QueryBroadcaster() {
  const client = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const tenantId = useTenantStore((state) => state.tenantId);

  useEffect(() => {
    if (!userId) return;
    return broadcastQueryClient({
      queryClient: client,
      broadcastChannel: scopedChannel(QUERY_SYNC_CHANNEL_BASE, { userId, tenantId }),
    });
  }, [client, userId, tenantId]);

  return null;
}
