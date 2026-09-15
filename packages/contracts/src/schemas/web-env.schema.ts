import { z } from "zod";

export const webEnvSchema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_APP_NAME: z.string().trim().min(1).max(100).default("Workspace"),
  VITE_EXAMPLE_FEATURES_ENABLED: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
