import { describe, expect, it, vi, beforeEach } from "vitest";
import * as Notifications from "expo-notifications";
import { getApiClient } from "@/lib/api";
import { nativeState } from "@/test/native-state";
import {
  getCachedPushDevice,
  getCachedPushToken,
  resolveNotificationRoute,
  resolvePushRegistration,
  setCachedPushDevice,
  setCachedPushToken,
  unregisterPushDevice,
} from "./push";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { notifications: { deleteDevice: vi.fn() } };
const TOKEN = "ExponentPushToken[abc]";

describe("push token cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("round-trips the token through secure storage", async () => {
    await setCachedPushToken(TOKEN);

    await expect(getCachedPushToken()).resolves.toBe(TOKEN);
  });

  it("removes the token when cleared", async () => {
    await setCachedPushToken(TOKEN);
    await setCachedPushToken(null);

    await expect(getCachedPushToken()).resolves.toBeNull();
  });

  it("rejects corrupt device payloads", async () => {
    nativeState.secureStore.set("push-device", "{not-json");
    await expect(getCachedPushDevice()).resolves.toBeNull();

    nativeState.secureStore.set("push-device", JSON.stringify({ token: TOKEN }));
    await expect(getCachedPushDevice()).resolves.toBeNull();

    await setCachedPushDevice({ token: TOKEN, id: "d-1" });
    await expect(getCachedPushDevice()).resolves.toEqual({ token: TOKEN, id: "d-1" });
  });
});

describe("resolvePushRegistration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: TOKEN } as never);
  });

  it("returns null when not running on a device", async () => {
    nativeState.isDevice = false;

    await expect(resolvePushRegistration()).resolves.toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("returns null when permission is denied", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
      status: "denied",
    } as never);

    await expect(resolvePushRegistration()).resolves.toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("registers the android channel and returns the token", async () => {
    const registration = await resolvePushRegistration();

    expect(registration).toEqual({ uri: TOKEN, platform: "android", token: TOKEN });
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith("notifications", {
      name: "Notifications",
      importance: 3,
    });
  });

  it("skips channel setup on ios", async () => {
    nativeState.platformOS = "ios";

    const registration = await resolvePushRegistration();

    expect(registration?.platform).toBe("ios");
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe("unregisterPushDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    client.notifications.deleteDevice.mockResolvedValue({ status: 204, body: null });
  });

  it("removes the server device and clears the cache", async () => {
    await setCachedPushDevice({ token: TOKEN, id: "d-1" });
    await setCachedPushToken(TOKEN);

    await unregisterPushDevice();

    expect(client.notifications.deleteDevice).toHaveBeenCalledWith("d-1");
    await expect(getCachedPushDevice()).resolves.toBeNull();
    await expect(getCachedPushToken()).resolves.toBeNull();
  });

  it("still clears the cache when the server call fails", async () => {
    client.notifications.deleteDevice.mockRejectedValue(new Error("offline"));
    await setCachedPushDevice({ token: TOKEN, id: "d-1" });

    await expect(unregisterPushDevice()).resolves.toBeUndefined();
    await expect(getCachedPushDevice()).resolves.toBeNull();
  });
});

describe("resolveNotificationRoute", () => {
  it("routes invitations to the accept screen", () => {
    expect(resolveNotificationRoute({ type: "tenancy.invitation.received" })).toBe(
      "/accept-invitation",
    );
  });

  it("routes export-ready to settings", () => {
    expect(resolveNotificationRoute({ type: "privacy.export.ready" })).toBe("/(tabs)/settings");
  });

  it("deep-links notes by id", () => {
    expect(resolveNotificationRoute({ type: "note.created", data: { noteId: "n-1" } })).toBe(
      "/notes/n-1",
    );
  });

  it("falls back to the notification center", () => {
    expect(resolveNotificationRoute({ type: "user.welcome" })).toBe("/(tabs)/notifications");
    expect(resolveNotificationRoute({ type: "note.created", data: { noteId: 42 } })).toBe(
      "/(tabs)/notifications",
    );
  });
});
