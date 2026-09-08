/**
 * Mutable backing state for the native module doubles in `setup.ts`.
 * ESM namespace objects are frozen, so tests drive the mocks through here.
 */
export const nativeState = {
  isDevice: true,
  platformOS: "android" as "ios" | "android" | "web",
  secureStore: new Map<string, string>(),
};

export function resetNativeState() {
  nativeState.isDevice = true;
  nativeState.platformOS = "android";
  nativeState.secureStore.clear();
}
