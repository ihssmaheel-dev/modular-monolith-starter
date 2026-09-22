import { z } from "zod";

const WEB_API_URL_MAX_LENGTH = 2048;

function isSupportedWebApiUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) {
    const parsed = new URL(value, "https://application.invalid");
    return parsed.search.length === 0 && parsed.hash.length === 0;
  }

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

export const webEnvSchema = z.object({
  VITE_API_URL: z.string().trim().min(1).max(WEB_API_URL_MAX_LENGTH).refine(isSupportedWebApiUrl),
  VITE_APP_NAME: z.string().trim().min(1).max(100).default("Workspace"),
  VITE_EXAMPLE_FEATURES_ENABLED: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
