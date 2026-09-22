import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests that use module-level mocks (`vi.mock` on libraries or modules)
 * or mutate global/process environment state must be isolated per worker thread.
 * All other tests run in the shared non-isolated project for high performance.
 */
const isolatedTestPatterns = [
  "**/src/common/guards/auth.guard.test.ts",
  "**/src/common/utils/origin.utils.test.ts",
  "**/src/infrastructure/api-docs/api-docs.test.ts",
  "**/src/infrastructure/cache/cache.service.test.ts",
  "**/src/infrastructure/database/connection/database-pool.test.ts",
  "**/src/infrastructure/database/database.service.test.ts",
  "**/src/infrastructure/database/tenancy/tenant-context.service.test.ts",
  "**/src/infrastructure/database/tenancy/verify-tenancy-mode.test.ts",
  "**/src/infrastructure/email/email.service.test.ts",
  "**/src/infrastructure/error-reporting/error-reporter.service.test.ts",
  "**/src/infrastructure/feature-flags/feature-flags.service.test.ts",
  "**/src/infrastructure/metrics/metrics.service.test.ts",
  "**/src/infrastructure/queue/queue.service.test.ts",
  "**/src/infrastructure/queue/workbench.setup.test.ts",
  "**/src/infrastructure/rate-limit/rate-limit.service.test.ts",
  "**/src/infrastructure/realtime/transports/realtime-websocket.gateway.test.ts",
  "**/src/infrastructure/session/session.service.test.ts",
  "**/src/infrastructure/storage/storage.service.test.ts",
  "**/src/infrastructure/tracing/tracing.interceptor.test.ts",
  "**/src/modules/auth/application/commands/forgot-password.command.test.ts",
  "**/src/modules/auth/application/commands/login.command.test.ts",
  "**/src/modules/auth/application/commands/refresh-tokens.command.test.ts",
  "**/src/modules/auth/application/commands/verify-email.command.test.ts",
  "**/src/modules/auth/application/utils/jwt.utils.test.ts",
  "**/src/modules/files/application/commands/request-upload.command.test.ts",
  "**/src/modules/tenancy/application/listeners/invitation-email.listener.test.ts",
  "**/src/modules/tenancy/application/queries/can-delete-user.query.test.ts",
  "**/src/modules/tenancy/application/queries/resolve-tenant-access.query.test.ts",
  "**/src/modules/users/application/commands/create-user.command.test.ts",
  "**/src/modules/users/application/listeners/welcome-email.listener.test.ts",
  "**/src/modules/users/application/queries/get-users.query.test.ts",
  "**/src/modules/users/application/queries/verify-user-credentials.query.test.ts",
];

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    // API tests load the Nest dependency graph and compiler state. Keep the
    // worker count bounded so high-core developer and CI hosts do not multiply
    // that memory footprint until the operating system starts killing workers.
    maxWorkers: 1,
    testTimeout: 15_000,
    fsModuleCache: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.integration.test.ts",
        "src/**/*.e2e.test.ts",
        "src/**/*.module.ts",
        "src/**/index.ts",
        "src/**/*.types.ts",
        "src/**/schemas/*.schema.ts",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    projects: [
      {
        test: {
          name: "isolated",
          isolate: true,
          include: isolatedTestPatterns,
          globals: true,
          environment: "node",
        },
      },
      {
        test: {
          name: "unit",
          isolate: false,
          include: ["src/**/*.test.ts"],
          exclude: [
            ...isolatedTestPatterns,
            "src/**/*.e2e.test.ts",
            "src/**/*.integration.test.ts",
          ],
          globals: true,
          environment: "node",
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
