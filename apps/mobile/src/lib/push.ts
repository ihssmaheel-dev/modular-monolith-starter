import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { getApiClient } from "./api";
import { useAuthStore } from "@/stores/auth.store";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function resolveExpoToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  const status =
    existing === "granted" ? existing : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

/** Register this device for push once an authenticated session exists. Idempotent server-side. */
export async function registerPushDevice(): Promise<void> {
  try {
    if (useAuthStore.getState().status !== "authenticated") return;
    const token = await resolveExpoToken();
    if (!token) return;
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await getApiClient().notifications.registerDevice({ platform, provider: "expo", token });
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  } catch {
    // Push is best-effort; the center remains the source of truth.
  }
}

/** Map a notification payload to an in-app route for tap-through. */
export function resolveNotificationRoute(notification: {
  type: string;
  data?: Record<string, unknown> | null;
}): string {
  const data = notification.data ?? {};
  if (notification.type === "tenancy.invitation.received") return "/accept-invitation";
  if (notification.type === "privacy.export.ready") return "/(tabs)/settings";
  if (typeof data.noteId === "string") return `/notes/${data.noteId}`;
  return "/(tabs)";
}
