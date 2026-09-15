import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.e2e.*"],
    pool: "threads",
    maxWorkers: 2,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/test/**",
        // Presentational layer: covered by the deferred Phase 3 component
        // runner (Jest/RNTL needs architecture review per PACKAGE_POLICY).
        "src/components/**",
        "src/features/**/components/**",
        "src/theme/**",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
