import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWebEnv } from "@/lib/env";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { queryKeys } from "@/lib/query-keys";

const SSE_EVENT = "notification.created";

/**
 * Live notification fan-in over SSE (`GET /api/v1/realtime/events`, cookie auth).
 * Any `notification.created` event invalidates the center + badge queries.
 * EventSource cannot send headers, so the tenant travels as ?tenantId= and
 * the server resolves membership for it. Relies on native EventSource
 * auto-reconnect; never closes on error.
 */
export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const tenantId = useTenantStore((state) => state.tenantId);

  useEffect(() => {
    if (!userId) return;
    const baseUrl = getWebEnv().VITE_API_URL.replace(/\/+$/, "");
    const url = tenantId
      ? `${baseUrl}/realtime/events?tenantId=${encodeURIComponent(tenantId)}`
      : `${baseUrl}/realtime/events`;
    let source: EventSource;
    try {
      source = new EventSource(url, { withCredentials: true });
    } catch {
      return;
    }
    const invalidate = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data as string) as unknown;
        if (payload === null || typeof payload !== "object") return;
      } catch {
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    };
    source.addEventListener(SSE_EVENT, invalidate);
    return () => {
      source.removeEventListener(SSE_EVENT, invalidate);
      source.close();
    };
  }, [userId, tenantId, queryClient]);
}
