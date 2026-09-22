import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PinoLoggerService } from "../../logger/logger.service";
import { createDatabasePool } from "./database-pool";

const poolState = vi.hoisted(() => ({
  connectListener: undefined as ((client: unknown) => void) | undefined,
}));

vi.mock("../../../config/env", () => ({
  env: {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    DB_MAX_POOL_SIZE: 2,
    DB_STATEMENT_TIMEOUT_MS: 1_000,
  },
}));

vi.mock("pg", () => ({
  Pool: class {
    on(event: string, listener: (client: unknown) => void): this {
      if (event === "connect") poolState.connectListener = listener;
      return this;
    }
  },
}));

describe("database pool query instrumentation", () => {
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as PinoLoggerService;

  beforeEach(() => {
    poolState.connectListener = undefined;
    vi.clearAllMocks();
  });

  it("does not report a successful callback query as a failure", () => {
    createDatabasePool(logger);
    const callback = vi.fn();
    const client = {
      query: vi.fn((_query: string, done: (error: Error | null, result: unknown) => void) =>
        done(null, { rows: [{ value: 1 }] }),
      ),
    };

    poolState.connectListener?.(client);
    client.query("SELECT 1", callback);

    expect(callback).toHaveBeenCalledWith(null, { rows: [{ value: 1 }] });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports a failed callback query", () => {
    createDatabasePool(logger);
    const failure = new Error("query failed");
    const client = {
      query: vi.fn((_query: string, done: (error: Error | null) => void) => done(failure)),
    };

    poolState.connectListener?.(client);
    client.query("SELECT 1", vi.fn());

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorName: "Error" }),
      "Database query failed",
    );
  });
});
