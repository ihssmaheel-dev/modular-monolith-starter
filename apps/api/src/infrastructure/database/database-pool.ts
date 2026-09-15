import { Pool } from "pg";
import { createHash } from "node:crypto";
import { env } from "../../config/env";
import type { PinoLoggerService } from "../logger/logger.service";
import { databaseErrorMetadata } from "./database-error.utils";

const SLOW_QUERY_MILLISECONDS = 100;

export function createDatabasePool(logger: PinoLoggerService): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_MAX_POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    query_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  });
  pool.on("error", (error) => logger.error(databaseErrorMetadata(error), "Postgres pool error"));
  instrumentQueries(pool, logger);
  return pool;
}

function instrumentQueries(pool: Pool, logger: PinoLoggerService): void {
  const originalQuery = pool.query.bind(pool);
  // @ts-expect-error pg exposes overloaded query signatures that cannot be reassigned precisely.
  pool.query = async (...args: Parameters<typeof originalQuery>) => {
    const start = performance.now();
    try {
      const result = await originalQuery(...args);
      logSlowQuery(logger, args[0], performance.now() - start);
      return result;
    } catch (error) {
      logger.error(
        queryLogContext(args[0], performance.now() - start, error),
        "Database query failed",
      );
      throw error;
    }
  };
}

function logSlowQuery(logger: PinoLoggerService, query: unknown, durationMs: number): void {
  if (durationMs <= SLOW_QUERY_MILLISECONDS) return;
  logger.warn(queryLogContext(query, durationMs), "Slow database query detected (>100ms)");
}

function queryLogContext(query: unknown, durationMs: number, error?: unknown) {
  const sqlText =
    typeof query === "string" ? query : ((query as { text?: string } | undefined)?.text ?? "SQL");
  return {
    statementType:
      sqlText
        .trim()
        .match(/^[A-Za-z]+/)?.[0]
        ?.toUpperCase() ?? "UNKNOWN",
    queryHash: createHash("sha256").update(sqlText).digest("hex").slice(0, 16),
    queryLength: sqlText.length,
    durationMs: Math.round(durationMs),
    ...(error === undefined ? {} : databaseErrorMetadata(error)),
  };
}
