import { webEnvSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";

describe("web environment contract", () => {
  it.each(["/api/v1", "https://api.example.com/api/v1", "http://localhost:5156/api/v1"])(
    "accepts the supported API base URL %s",
    (apiUrl) => {
      expect(webEnvSchema.safeParse({ VITE_API_URL: apiUrl }).success).toBe(true);
    },
  );

  it.each(["api/v1", "//attacker.example/api", "javascript:alert(1)", "/api/v1?token=secret"])(
    "rejects the unsupported API base URL %s",
    (apiUrl) => {
      expect(webEnvSchema.safeParse({ VITE_API_URL: apiUrl }).success).toBe(false);
    },
  );
});
