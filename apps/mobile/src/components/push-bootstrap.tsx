import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { getQueryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/auth.store";
import { registerPushDevice, resolveNotificationRoute } from "@/lib/push";

/** Registers the device token and wires tap-through + live invalidation. */
export function PushBootstrap() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "authenticated") return;
    void registerPushDevice();

    const received = Notifications.addNotificationReceivedListener(() => {
      getQueryClient().invalidateQueries({ queryKey: ["notifications"] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      getQueryClient().invalidateQueries({ queryKey: ["notifications"] });
      const content = response.notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      const type = typeof data.type === "string" ? data.type : "";
      router.push(resolveNotificationRoute({ type, data }) as never);
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [status]);

  return null;
}
