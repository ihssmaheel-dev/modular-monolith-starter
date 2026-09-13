import { eq, and, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { ok, type Result } from "neverthrow";
import { env } from "../../../config/env";
import { DatabaseService } from "../database.service";
import { TenantContextService } from "../context/tenant-context.service";
import type { BaseFindOptions, Id } from "./repository.types";

export const DEFAULT_FIND_LIMIT = 1_000;
export const MAX_FIND_LIMIT = 5_000;

export abstract class BaseReadRepository<TEntity, TRow> {
  constructor(
    protected readonly table: PgTable,
    protected readonly database: DatabaseService,
    protected readonly tenantContext: TenantContextService,
    protected readonly tenantScoped: boolean = false,
  ) {}

  protected abstract toDomain(row: TRow): TEntity;

  protected getDb() {
    return this.database.getTx() ?? this.database.getDb();
  }

  protected tenantFilter(): Record<string, unknown> | undefined {
    if (!this.tenantScoped) return undefined;
    const ctx = this.tenantContext.get();
    return ctx.tenantId ? { tenantId: ctx.tenantId } : undefined;
  }

  protected isTenantIsolationRequired(): boolean {
    return this.tenantScoped && env.TENANCY_MODE === "multi";
  }

  protected hasMissingTenantContext(): boolean {
    return (
      this.isTenantIsolationRequired() &&
      !this.tenantFilter() &&
      !this.tenantContext.isSystemScope()
    );
  }

  async findById(id: Id, _options: BaseFindOptions = {}): Promise<Result<TEntity | null, never>> {
    if (this.hasMissingTenantContext()) return ok(null);
    const db = this.getDb();
    const tenantFilter = this.tenantFilter();
    const filter: Record<string, unknown> = tenantFilter
      ? { id: id as string, ...tenantFilter }
      : { id: id as string };
    const conditions = this.buildConditions(filter);
    const rows = await (
      db as unknown as {
        select: () => { from: (t: unknown) => { where: (c: unknown) => Promise<TRow[]> } };
      }
    )
      .select()
      .from(this.table)
      .where(conditions);
    const row = rows[0] ?? null;
    if (!row) return ok(null);
    return ok(this.toDomain(row));
  }

  async findOne(filter: Record<string, unknown>): Promise<Result<TEntity | null, never>> {
    if (this.hasMissingTenantContext()) return ok(null);
    const db = this.getDb();
    const conditions = this.buildConditions({ ...filter, ...this.tenantFilter() });
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<TRow[]> };
          };
        };
      }
    )
      .select()
      .from(this.table)
      .where(conditions)
      .limit(1);
    const row = rows[0] ?? null;
    return ok(row ? this.toDomain(row) : null);
  }

  async find(
    filter: Record<string, unknown> = {},
    options: BaseFindOptions = {},
  ): Promise<Result<TEntity[], never>> {
    if (this.hasMissingTenantContext()) return ok([]);
    const db = this.getDb();
    const limit = Math.min(options.limit ?? DEFAULT_FIND_LIMIT, MAX_FIND_LIMIT);
    const conditions = this.buildConditions({ ...filter, ...this.tenantFilter() });
    const query = (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<TRow[]> } | Promise<TRow[]>;
            limit: (n: number) => Promise<TRow[]>;
          };
        };
      }
    )
      .select()
      .from(this.table);

    let rows: TRow[];
    if (conditions) {
      const filtered = (query as unknown as { where: (c: unknown) => unknown }).where(conditions);
      rows =
        typeof (filtered as { limit?: (n: number) => Promise<TRow[]> }).limit === "function"
          ? await (filtered as { limit: (n: number) => Promise<TRow[]> }).limit(limit)
          : await (filtered as Promise<TRow[]>);
    } else {
      rows =
        typeof (query as unknown as { limit?: (n: number) => Promise<TRow[]> }).limit === "function"
          ? await (query as unknown as { limit: (n: number) => Promise<TRow[]> }).limit(limit)
          : await (query as unknown as Promise<TRow[]>);
    }
    return ok(rows.map((r) => this.toDomain(r)));
  }

  async count(filter: Record<string, unknown> = {}): Promise<Result<number, never>> {
    if (this.hasMissingTenantContext()) return ok(0);
    const db = this.getDb();
    const conditions = this.buildConditions({ ...filter, ...this.tenantFilter() });
    const result = await (
      db as unknown as {
        select: (v: unknown) => {
          from: (t: unknown) => { where: (c: unknown) => Promise<{ count: number }[]> };
        };
      }
    )
      .select({ count: sql<number>`count(*)` })
      .from(this.table)
      .where(conditions);
    return ok(Number(result[0]?.count ?? 0));
  }

  protected buildConditions(filter: Record<string, unknown>): unknown {
    const cols = this.table as unknown as Record<string, unknown>;
    const clauses: unknown[] = [];
    for (const [key, value] of Object.entries(filter)) {
      const col = cols[key] as Parameters<typeof eq>[0] | undefined;
      if (col) clauses.push(eq(col, value as string));
    }
    const deletedAt = cols["deletedAt"] as unknown;
    if (deletedAt) clauses.push(isNull(deletedAt as Parameters<typeof isNull>[0]));
    if (clauses.length === 0) return undefined;
    if (clauses.length === 1) return clauses[0];
    return and(...(clauses as Parameters<typeof and>));
  }
}
