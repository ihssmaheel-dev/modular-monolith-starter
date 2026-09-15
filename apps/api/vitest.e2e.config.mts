import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const CONTAINER_HOOK_TIMEOUT_MS = 120_000;

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.e2e.test.ts"],
    setupFiles: ["test/setup.e2e.ts"],
    testTimeout: 60_000,
    hookTimeout: CONTAINER_HOOK_TIMEOUT_MS,
    pool: "threads",
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
