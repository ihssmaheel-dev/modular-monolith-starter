import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { existsSync } from "node:fs";
import os from "node:os";
import { Piscina } from "piscina";
import { PinoLoggerService } from "../logger/logger.service";

export interface WorkerPoolConfig {
  name: string;
  filename: string;
  maxThreads?: number;
  minThreads?: number;
  maxQueue?: number;
  idleTimeoutMs?: number;
  concurrentTasksPerWorker?: number;
  execArgv?: string[];
}

export interface WorkerPoolStats {
  completed: number;
  threads: number;
  queueSize: number;
  maxQueue: number;
  maxThreads: number;
}

const DEFAULT_MIN_THREADS = 0;
const DEFAULT_MAX_QUEUE = 1_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENT_TASKS_PER_WORKER = 1;

/**
 * Calculates optimal CPU worker count leaving 1 core for the main event loop.
 */
export function getOptimalWorkerThreadCount(): number {
  const availableCores =
    typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, availableCores - 1);
}

@Injectable()
export class PiscinaService implements OnModuleDestroy {
  private pools = new Map<string, Piscina>();
  private poolConfigs = new Map<string, Required<WorkerPoolConfig>>();
  private logger: PinoLoggerService;

  constructor(logger: PinoLoggerService) {
    this.logger = logger.child({ module: "PiscinaService" });
  }

  getPool(config: WorkerPoolConfig): Piscina {
    const existing = this.pools.get(config.name);
    if (existing) return existing;

    this.validateScriptPath(config);
    const resolvedConfig = this.resolveConfig(config);
    const pool = new Piscina({
      filename: resolvedConfig.filename,
      maxThreads: resolvedConfig.maxThreads,
      minThreads: resolvedConfig.minThreads,
      maxQueue: resolvedConfig.maxQueue,
      idleTimeout: resolvedConfig.idleTimeoutMs,
      concurrentTasksPerWorker: resolvedConfig.concurrentTasksPerWorker,
      execArgv: resolvedConfig.execArgv,
    });

    this.pools.set(config.name, pool);
    this.poolConfigs.set(config.name, resolvedConfig);

    this.logger.info(
      {
        pool: config.name,
        maxThreads: resolvedConfig.maxThreads,
        minThreads: resolvedConfig.minThreads,
        maxQueue: resolvedConfig.maxQueue,
        idleTimeoutMs: resolvedConfig.idleTimeoutMs,
      },
      "Worker pool created",
    );

    return pool;
  }

  async run<TInput = unknown, TOutput = unknown>(
    poolName: string,
    task: string | undefined,
    data: TInput,
  ): Promise<TOutput> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Worker pool "${poolName}" not found. Call getPool() first.`);
    }

    try {
      this.logger.debug({ pool: poolName, task: task ?? "default" }, "Running worker task");
      const options = task ? { name: task } : undefined;
      const result = await pool.run(data, options);
      return result as TOutput;
    } catch (error) {
      const stats = this.getStats(poolName);
      this.logger.error(
        { pool: poolName, task: task ?? "default", error, stats },
        "Worker task execution failed",
      );
      throw error;
    }
  }

  getStats(poolName: string): WorkerPoolStats | null {
    const pool = this.pools.get(poolName);
    const config = this.poolConfigs.get(poolName);
    if (!pool || !config) return null;

    return {
      completed: pool.completed,
      threads: pool.threads.length,
      queueSize: pool.queueSize,
      maxQueue: config.maxQueue,
      maxThreads: config.maxThreads,
    };
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, pool] of this.pools) {
      this.logger.info({ pool: name }, "Destroying worker pool");
      await pool.destroy();
    }
    this.pools.clear();
    this.poolConfigs.clear();
  }

  private validateScriptPath(config: WorkerPoolConfig): void {
    if (!existsSync(config.filename)) {
      this.logger.warn(
        { pool: config.name, filename: config.filename },
        "Worker pool script path does not exist on disk",
      );
    }
  }

  private resolveConfig(config: WorkerPoolConfig): Required<WorkerPoolConfig> {
    const defaultExecArgv =
      config.filename.endsWith(".ts") && !config.execArgv
        ? ["--import", "tsx"]
        : (config.execArgv ?? []);

    return {
      name: config.name,
      filename: config.filename,
      maxThreads: config.maxThreads ?? getOptimalWorkerThreadCount(),
      minThreads: config.minThreads ?? DEFAULT_MIN_THREADS,
      maxQueue: config.maxQueue ?? DEFAULT_MAX_QUEUE,
      idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      concurrentTasksPerWorker:
        config.concurrentTasksPerWorker ?? DEFAULT_CONCURRENT_TASKS_PER_WORKER,
      execArgv: defaultExecArgv,
    };
  }
}
