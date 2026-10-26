import { webEnvSchema } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("public build configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(["server", "browser"])(
    "uses the public build values in the %s rendering context",
    async (runtime) => {
      vi.resetModules();
      vi.stubEnv("VITE_API_URL", "/api/v1");
      vi.stubEnv("VITE_FILE_UPLOAD_ORIGIN", "https://uploads.build.example");
      vi.stubEnv("VITE_APP_NAME", "Built application");
      vi.stubEnv("VITE_EXAMPLE_FEATURES_ENABLED", "false");
      if (runtime === "server") vi.stubGlobal("window", undefined);

      const { getWebEnv } = await import("./env");

      expect(getWebEnv()).toEqual({
        VITE_API_URL: "/api/v1",
        VITE_FILE_UPLOAD_ORIGIN: "https://uploads.build.example",
        VITE_APP_NAME: "Built application",
        VITE_EXAMPLE_FEATURES_ENABLED: false,
      });
    },
  );
});
