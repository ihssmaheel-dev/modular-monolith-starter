import { webEnvSchema, type WebEnv } from "@repo/contracts";

export type { WebEnv };

export const isDev: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

function loadEnv(): WebEnv {
  // Vite exposes env via import.meta.env
  const raw = import.meta.env as Record<string, string | undefined>;
  const parsed = webEnvSchema.safeParse({
    VITE_API_URL: raw.VITE_API_URL,
    VITE_APP_NAME: raw.VITE_APP_NAME,
    VITE_EXAMPLE_FEATURES_ENABLED: raw.VITE_EXAMPLE_FEATURES_ENABLED,
  });
  if (!parsed.success) throw new Error("Invalid web environment configuration");
  return parsed.data;
}

// Lazy to avoid SSR issues
let cached: WebEnv | null = null;
export function getWebEnv(): WebEnv {
  if (cached) return cached;
  // On server, import.meta.env may not be available — fallback to process.env
  if (typeof window === "undefined") {
    const runtime = globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    };
    const serverRaw = {
      VITE_API_URL: runtime.process?.env?.VITE_API_URL,
      VITE_APP_NAME: runtime.process?.env?.VITE_APP_NAME,
      VITE_EXAMPLE_FEATURES_ENABLED: runtime.process?.env?.VITE_EXAMPLE_FEATURES_ENABLED,
    };
    const parsed = webEnvSchema.safeParse(serverRaw);
    if (!parsed.success) throw new Error("Invalid web environment configuration");
    cached = parsed.data;
    return cached;
  }
  cached = loadEnv();
  return cached;
}
