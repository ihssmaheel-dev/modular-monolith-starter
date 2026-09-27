import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@repo/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url),
      ),
      "@repo/i18n": fileURLToPath(new URL("../../packages/i18n/src/index.ts", import.meta.url)),
      "@repo/authorization": fileURLToPath(
        new URL("../../packages/authorization/src/index.ts", import.meta.url),
      ),
      "@repo/api-client": fileURLToPath(
        new URL("../../packages/api-client/src/index.ts", import.meta.url),
      ),
      "@repo/ui/globals.css": fileURLToPath(
        new URL("../../packages/ui/src/styles/globals.css", import.meta.url),
      ),
      "@repo/ui": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "src/**/*.e2e.*"],
    pool: "threads",
    maxWorkers: 2,
    fsModuleCache: true,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/routeTree.gen.ts", "src/**/*.d.ts", "src/routes/**"],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
});
