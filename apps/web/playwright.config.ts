import { defineConfig, devices } from "@playwright/test";

const apiUrl = process.env.VITE_API_URL ?? "http://127.0.0.1:5156/api/v1";
const parsedApiUrl = new URL(apiUrl);
const apiOrigin = parsedApiUrl.origin;
const apiBasePath = parsedApiUrl.pathname.replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
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
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // Do not inherit a developer's ignored .env or telemetry destinations.
        DOTENV_CONFIG_PATH: ".env.e2e",
        OTEL_SDK_DISABLED: "true",
        TENANCY_MODE: process.env.TENANCY_MODE ?? "multi",
        EXAMPLE_FEATURES_ENABLED: "true",
        // Each browser test models a separate client behind the trusted test proxy.
        TRUST_PROXY: "true",
        API_URL: apiOrigin,
        CLIENT_URL: "http://127.0.0.1:5155",
        PORT: parsedApiUrl.port || "5156",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        S3_FORCE_PATH_STYLE: "true",
      },
    },
    {
      command: process.env.CI
        ? "pnpm --filter web start"
        : "pnpm --filter web dev --host 127.0.0.1 --strictPort",
      url: "http://127.0.0.1:5155/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        HOST: "127.0.0.1",
        PORT: "5155",
        VITE_API_URL: apiUrl,
        VITE_FILE_UPLOAD_ORIGIN: process.env.VITE_FILE_UPLOAD_ORIGIN ?? "http://127.0.0.1:9000",
        VITE_EXAMPLE_FEATURES_ENABLED: "true",
      },
    },
  ],
});
