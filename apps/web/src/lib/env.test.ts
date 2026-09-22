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

  it.each(["http://127.0.0.1:9000", "https://uploads.example.com"])(
    "accepts the file upload origin %s",
    (uploadOrigin) => {
      expect(
        webEnvSchema.safeParse({
          VITE_API_URL: "/api/v1",
          VITE_FILE_UPLOAD_ORIGIN: uploadOrigin,
        }).success,
      ).toBe(true);
    },
  );

  it.each([
    "//storage.example.com",
    "javascript:alert(1)",
    "https://user:password@storage.example.com",
    "https://storage.example.com/uploads",
  ])("rejects the unsafe file upload origin %s", (uploadOrigin) => {
    expect(
      webEnvSchema.safeParse({
        VITE_API_URL: "/api/v1",
        VITE_FILE_UPLOAD_ORIGIN: uploadOrigin,
      }).success,
    ).toBe(false);
  });
});
