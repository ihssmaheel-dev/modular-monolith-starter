import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useThrottledCallback } from "@tanstack/react-pacer";
import { getWebEnv } from "@/lib/env";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { queryKeys } from "@/lib/query-keys";

const SSE_EVENT = "notification.created";
const SSE_SYNC_EVENT = "sync_required";

export const SSE_THROTTLE_MS = 1000;

/**
 * Live notification fan-in over SSE (`GET /api/v1/realtime/events`, cookie auth).
 * Any `notification.created` event invalidates the center + badge queries.
 * Invalidations are throttled (leading + trailing) so event bursts collapse
 * into at most two refetches per window instead of one per event.
 * EventSource cannot send headers, so the tenant travels as ?tenantId= and
 * the server resolves membership for it. Relies on native EventSource
 * auto-reconnect; never closes on error. Pending throttled work cancels on
 * unmount via the Pacer hook lifecycle.
 */
export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const tenantId = useTenantStore((state) => state.tenantId);

  const throttledInvalidate = useThrottledCallback(
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
    { wait: SSE_THROTTLE_MS, leading: true, trailing: true },
  );

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
    const invalidateNotification = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data as string) as unknown;
        if (payload === null || typeof payload !== "object") return;
      } catch {
        return;
      }
      throttledInvalidate();
    };
    source.addEventListener("open", throttledInvalidate);
    source.addEventListener(SSE_SYNC_EVENT, throttledInvalidate);
    source.addEventListener(SSE_EVENT, invalidateNotification);
    return () => {
      source.removeEventListener("open", throttledInvalidate);
      source.removeEventListener(SSE_SYNC_EVENT, throttledInvalidate);
      source.removeEventListener(SSE_EVENT, invalidateNotification);
      source.close();
    };
  }, [userId, tenantId, queryClient, throttledInvalidate]);
}
