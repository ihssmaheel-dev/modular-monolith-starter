import { err, Result } from "neverthrow";

export interface BulkheadOptions {
  maxConcurrent: number;
  maxKeys?: number;
}

export class Bulkhead<E> {
  private readonly counts = new Map<string, number>();
  private readonly maxConcurrent: number;
  private readonly maxKeys: number;
  private readonly fallbackError: E;

  constructor(options: BulkheadOptions, fallbackError: E) {
    this.maxConcurrent = options.maxConcurrent;
    this.maxKeys = options.maxKeys ?? 1000;
    this.fallbackError = fallbackError;
  }

  async execute<T>(
    action: () => Promise<Result<T, E>>,
    key = "default",
  ): Promise<Result<T, E>> {
    const active = this.counts.get(key) ?? 0;
    if (active >= this.maxConcurrent) {
      return err(this.fallbackError);
    }
    if (!this.counts.has(key) && this.counts.size >= this.maxKeys) {
      return err(this.fallbackError);
    }

    this.counts.set(key, active + 1);
    try {
      return await action();
    } finally {
      const remaining = (this.counts.get(key) ?? 1) - 1;
      if (remaining <= 0) this.counts.delete(key);
      else this.counts.set(key, remaining);
    }
  }

  getActiveCount(key?: string): number {
    if (key !== undefined) return this.counts.get(key) ?? 0;
    let total = 0;
    for (const count of this.counts.values()) total += count;
    return total;
  }
}
