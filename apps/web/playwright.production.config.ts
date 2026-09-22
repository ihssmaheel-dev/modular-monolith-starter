import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PRODUCTION_BASE_URL;
if (!baseURL) throw new Error("PRODUCTION_BASE_URL is required");

export default defineConfig({
  testDir: "./e2e-production",
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
