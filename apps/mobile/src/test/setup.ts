import { beforeEach, vi } from "vitest";

vi.stubEnv("EXPO_PUBLIC_API_URL", "http://localhost:5156/api/v1");
vi.stubEnv("EXPO_PUBLIC_APP_NAME", "Workspace");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("expo-secure-store", async () => {
  const { nativeState } = await import("./native-state");
  return {
    getItemAsync: (key: string) => Promise.resolve(nativeState.secureStore.get(key) ?? null),
    setItemAsync: (key: string, value: string) => {
      nativeState.secureStore.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key: string) => {
      nativeState.secureStore.delete(key);
      return Promise.resolve();
    },
  };
});

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

vi.mock("expo-device", async () => {
  const { nativeState } = await import("./native-state");
  return {
    get isDevice() {
      return nativeState.isDevice;
    },
  };
});

vi.mock("expo-constants", () => ({ default: {} }));

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en" }],
}));

vi.mock("expo-file-system", () => ({
  readAsStringAsync: vi.fn(),
  EncodingType: { Base64: "base64" },
}));

vi.mock("react-native", async () => {
  const { nativeState } = await import("./native-state");
  return {
    Platform: {
      get OS() {
        return nativeState.platformOS;
      },
      select: <T>(options: Record<string, T>) =>
        options[nativeState.platformOS] ?? options.default ?? options.android,
    },
    Linking: { openURL: vi.fn() },
  };
});

beforeEach(async () => {
  const { resetNativeState } = await import("./native-state");
  resetNativeState();
});

import "@/lib/i18n";
