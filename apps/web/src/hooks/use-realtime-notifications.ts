import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWebEnv } from "@/lib/env";
import { useAuthStore } from "@/stores/auth.store";
import { queryKeys } from "@/lib/query-keys";

const SSE_EVENT = "notification.created";

/**
 * Live notification fan-in over SSE (`GET /api/v1/realtime/events`, cookie auth).
 * Any `notification.created` event invalidates the center + badge queries.
 * Relies on native EventSource auto-reconnect; never closes on error.
 */
export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId) return;
    const baseUrl = getWebEnv().VITE_API_URL.replace(/\/+$/, "");
    let source: EventSource;
    try {
      source = new EventSource(`${baseUrl}/realtime/events`, { withCredentials: true });
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
  }, [userId, queryClient]);
}
