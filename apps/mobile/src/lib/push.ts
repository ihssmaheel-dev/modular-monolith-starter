import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { getApiClient } from "./api";
import { secureStorage } from "./secure-storage";

const CACHED_TOKEN_KEY = "push-token";
const CHANNEL_ID = "notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function resolvePlatform(): "ios" | "android" | "web" {
  return Platform.select({ ios: "ios", android: "android", web: "web", default: "android" }) as
    "ios" | "android" | "web";
}

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

export async function getCachedPushToken(): Promise<string | null> {
  return secureStorage.getItem(CACHED_TOKEN_KEY);
}

export async function setCachedPushToken(token: string | null): Promise<void> {
  if (token) await secureStorage.setItem(CACHED_TOKEN_KEY, token);
  else await secureStorage.removeItem(CACHED_TOKEN_KEY);
}

export interface CachedPushDevice {
  token: string;
  id: string;
}

const CACHED_DEVICE_KEY = "push-device";

export async function getCachedPushDevice(): Promise<CachedPushDevice | null> {
  const raw = await secureStorage.getItem(CACHED_DEVICE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedPushDevice>;
    if (typeof parsed.token === "string" && typeof parsed.id === "string") {
      return { token: parsed.token, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setCachedPushDevice(device: CachedPushDevice | null): Promise<void> {
  if (device) await secureStorage.setItem(CACHED_DEVICE_KEY, JSON.stringify(device));
  else await secureStorage.removeItem(CACHED_DEVICE_KEY);
}

/** Best-effort server-side removal of this device (stops pushes after logout). */
export async function unregisterPushDevice(): Promise<void> {
  try {
    const cached = await getCachedPushDevice();
    if (cached) {
      await getApiClient().notifications.deleteDevice(cached.id);
    }
  } catch {
    // Push cleanup is best-effort; the row is harmless without a token match.
  } finally {
    await setCachedPushDevice(null);
    await setCachedPushToken(null);
  }
}

/** Resolve device metadata for registration. Returns null when push is unavailable. */
export async function resolvePushRegistration(): Promise<{
  uri: string;
  platform: "ios" | "android" | "web";
  token: string;
} | null> {
  const token = await resolveExpoToken();
  if (!token) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Notifications",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return { uri: token, platform: resolvePlatform(), token };
}

/** Map a notification payload to an in-app route for tap-through. */
export function resolveNotificationRoute(notification: {
  type: string;
  data?: Record<string, unknown> | null;
}): string {
  const data = notification.data ?? {};
  if (notification.type === "tenancy.invitation.received") return "/accept-invitation";
  if (notification.type === "privacy.export.ready") return "/(tabs)/settings";
  if (typeof data.noteId === "string" && data.noteId.length > 0) {
    return `/notes/${encodeURIComponent(data.noteId)}`;
  }
  return "/(tabs)/notifications";
}
