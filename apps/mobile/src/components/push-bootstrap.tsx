import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth.store";
import { useRegisterDeviceMutation } from "@/features/notifications/notifications.mutations";
import {
  getCachedPushDevice,
  resolveNotificationRoute,
  resolvePushRegistration,
  setCachedPushDevice,
  setCachedPushToken,
} from "@/lib/push";

/** Registers the device token and wires tap-through + live invalidation. */
export function PushBootstrap() {
  const status = useAuthStore((s) => s.status);
  const registerDevice = useRegisterDeviceMutation();
  const registered = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || registered.current) return;
    registered.current = true;
    void (async () => {
      try {
        const registration = await resolvePushRegistration();
        if (!registration) {
          registered.current = false;
          return;
        }
        if ((await getCachedPushDevice())?.token !== registration.token) {
          const device = await registerDevice.mutateAsync({
            platform: registration.platform,
            token: registration.token,
          });
          await setCachedPushDevice({ token: registration.token, id: device.id });
          await setCachedPushToken(registration.token);
        }
      } catch {
        registered.current = false;
      }
    })();
  }, [status, registerDevice]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!last) return;
      const content = last.notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      const type = typeof data.type === "string" ? data.type : "";
      router.replace(resolveNotificationRoute({ type, data }) as never);
    });

    const received = Notifications.addNotificationReceivedListener(() => {
      getQueryClient().invalidateQueries({ queryKey: queryKeys.notifications.all() });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      getQueryClient().invalidateQueries({ queryKey: queryKeys.notifications.all() });
      const content = response.notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      const type = typeof data.type === "string" ? data.type : "";
      router.replace(resolveNotificationRoute({ type, data }) as never);
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [status]);

  return null;
}
