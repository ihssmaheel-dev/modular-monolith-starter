import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWebEnv } from "@/lib/env";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Live notification fan-in over SSE (`GET /api/realtime/events`, cookie auth).
 * Any `notification.*` event invalidates the center + badge queries.
 */
export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    let source: EventSource | null = null;
    try {
      const baseUrl = getWebEnv().VITE_API_URL.replace(/\/+$/, "");
      source = new EventSource(`${baseUrl}/realtime/events`, { withCredentials: true });
    } catch {
      return;
    }
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    source.addEventListener("notification.created", invalidate);
    source.onerror = () => {
      source?.close();
    };
    return () => {
      source?.close();
    };
  }, [user, queryClient]);
}
