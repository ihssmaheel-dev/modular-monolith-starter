import { mobileEnvSchema, type MobileEnv } from "@repo/contracts";

export type { MobileEnv };

let cached: MobileEnv | null = null;

export function getMobileEnv(): MobileEnv {
  if (cached) return cached;
  // Expo inlines EXPO_PUBLIC_* vars into the bundle at export time.
  const parsed = mobileEnvSchema.safeParse({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_APP_NAME: process.env.EXPO_PUBLIC_APP_NAME,
    EXPO_PUBLIC_EXAMPLE_FEATURES_ENABLED: process.env.EXPO_PUBLIC_EXAMPLE_FEATURES_ENABLED,
  });
  if (!parsed.success) throw new Error("Invalid mobile environment configuration");
  cached = parsed.data;
  return cached;
}
