import { describe, expect, it, vi, beforeEach } from "vitest";

describe("mobile env", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_API_URL", "http://localhost:5156/api/v1");
    vi.stubEnv("EXPO_PUBLIC_APP_NAME", "Workspace");
  });

  it("parses a valid config with the default app name", async () => {
    delete process.env.EXPO_PUBLIC_APP_NAME;
    const { getMobileEnv } = await import("./env");

    expect(getMobileEnv()).toMatchObject({
      EXPO_PUBLIC_API_URL: "http://localhost:5156/api/v1",
      EXPO_PUBLIC_APP_NAME: "Workspace",
    });
  });

  it("throws on a non-URL api endpoint", async () => {
    vi.stubEnv("EXPO_PUBLIC_API_URL", "not-a-url");
    const { getMobileEnv } = await import("./env");

    expect(() => getMobileEnv()).toThrow("Invalid mobile environment configuration");
  });

  it("caches the parsed config", async () => {
    const { getMobileEnv } = await import("./env");

    expect(getMobileEnv()).toBe(getMobileEnv());
  });
});
