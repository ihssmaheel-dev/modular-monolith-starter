import { defineConfig, devices } from "@playwright/test";

const apiUrl = process.env.VITE_API_URL ?? "http://127.0.0.1:5156/api/v1";
const parsedApiUrl = new URL(apiUrl);
const apiOrigin = parsedApiUrl.origin;
const apiBasePath = parsedApiUrl.pathname.replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5155",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter api start",
      url: `${apiOrigin}${apiBasePath}/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter web dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5155",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
