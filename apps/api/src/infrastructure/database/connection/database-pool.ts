import { createHash } from "node:crypto";
import { Pool, type PoolClient, type QueryResult } from "pg";

import { env } from "../../../config/env";
import type { PinoLoggerService } from "../../logger/logger.service";
import { databaseErrorMetadata } from "./database-error.utils";

const SLOW_QUERY_MILLISECONDS = 100;
const POOL_IDLE_TIMEOUT_MS = 30_000;
const POOL_CONNECTION_TIMEOUT_MS = 10_000;
const POOL_KEEP_ALIVE_INITIAL_DELAY_MS = 10_000;
const INSTRUMENTED_CLIENT = Symbol("instrumented-database-client");

type InstrumentedClient = PoolClient & { [INSTRUMENTED_CLIENT]?: boolean };
type QueryCallback = (error: Error | null, result?: QueryResult) => void;

export function createDatabasePool(logger: PinoLoggerService): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_MAX_POOL_SIZE,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: POOL_KEEP_ALIVE_INITIAL_DELAY_MS,
    query_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  });
  pool.on("error", (error) => logger.error(databaseErrorMetadata(error), "Postgres pool error"));
  pool.on("connect", (client) => instrumentClientQueries(client, logger));
  return pool;
}

function instrumentClientQueries(client: PoolClient, logger: PinoLoggerService): void {
  const instrumented = client as InstrumentedClient;
  if (instrumented[INSTRUMENTED_CLIENT]) return;
  instrumented[INSTRUMENTED_CLIENT] = true;
  const originalQuery = client.query.bind(client);

  client.query = ((...args: unknown[]) => {
    const start = performance.now();
    let callbackIndex = -1;
    for (let index = args.length - 1; index >= 0; index -= 1) {
      if (typeof args[index] === "function") {
        callbackIndex = index;
        break;
      }
    }
    if (callbackIndex >= 0) {
      const callback = args[callbackIndex] as QueryCallback;
      args[callbackIndex] = (error: Error | null, result?: QueryResult) => {
        recordQueryResult(logger, args[0], start, error);
        callback(error, result);
      };
      return Reflect.apply(originalQuery, client, args);
    }

    const result = Reflect.apply(originalQuery, client, args) as Promise<QueryResult>;
    return result.then(
      (value) => {
        recordQueryResult(logger, args[0], start);
        return value;
      },
      (error: unknown) => {
        recordQueryResult(logger, args[0], start, error);
        throw error;
      },
    );
  }) as PoolClient["query"];
}

function recordQueryResult(
  logger: PinoLoggerService,
  query: unknown,
  start: number,
  error?: unknown,
): void {
  const durationMs = performance.now() - start;
  if (error != null) {
    logger.error(queryLogContext(query, durationMs, error), "Database query failed");
  } else if (durationMs > SLOW_QUERY_MILLISECONDS) {
    logger.warn(queryLogContext(query, durationMs), "Slow database query detected (>100ms)");
  }
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
