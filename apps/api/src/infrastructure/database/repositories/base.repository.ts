import { eq, and, isNull, sql, gt, lt, desc, asc } from "drizzle-orm";
import { ok, err, type Result } from "neverthrow";
import { BaseReadRepository, MAX_FIND_LIMIT } from "./base-read.repository";
import type {
  Id,
  PaginatedResult,
  PaginationOptions,
  CursorPaginatedResult,
  CursorPaginationOptions,
} from "./repository.types";

export abstract class BaseRepository<TEntity, TRow> extends BaseReadRepository<TEntity, TRow> {
  async create(
    data: Record<string, unknown>,
  ): Promise<Result<TEntity, { type: "TENANT_REQUIRED" }>> {
    if (this.requiresTenantForWrite(data)) {
      return err({ type: "TENANT_REQUIRED" });
    }
    const db = this.getDb();
    const payload = {
      ...data,
      ...this.tenantFilter(),
      id: (data["id"] as string) ?? crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as TRow;
    const rows = await (
      db as unknown as {
        insert: (t: unknown) => { values: (v: unknown) => { returning: () => Promise<TRow[]> } };
      }
    )
      .insert(this.table)
      .values(payload as unknown as Record<string, unknown>)
      .returning();
    return ok(this.toDomain(rows[0] as TRow));
  }

  async createMany(
    data: Record<string, unknown>[],
  ): Promise<Result<TEntity[], { type: "TENANT_REQUIRED" }>> {
    if (data.some((item) => this.requiresTenantForWrite(item))) {
      return err({ type: "TENANT_REQUIRED" });
    }
    const db = this.getDb();
    const payloads = data.map((d) => ({
      ...d,
      ...this.tenantFilter(),
      id: (d["id"] as string) ?? crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const rows = await (
      db as unknown as {
        insert: (t: unknown) => { values: (v: unknown) => { returning: () => Promise<TRow[]> } };
      }
    )
      .insert(this.table)
      .values(payloads as unknown as Record<string, unknown>[])
      .returning();
    return ok(rows.map((r) => this.toDomain(r)));
  }

  private requiresTenantForWrite(data: Record<string, unknown>): boolean {
    if (!this.isTenantIsolationRequired() || this.tenantFilter()) return false;
    if (!this.tenantContext.isSystemScope()) return true;
    return typeof data.tenantId !== "string" || data.tenantId.length === 0;
  }

  async paginate(
    filter: Record<string, unknown> = {},
    options: PaginationOptions = {},
  ): Promise<Result<PaginatedResult<TEntity>, never>> {
    if (this.hasMissingTenantContext()) {
      return ok({
        items: [],
        total: 0,
        page: options.page ?? 1,
        limit: options.limit ?? 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    }
    return this.scopedRead(async (db) => {
      const page = Math.max(1, options.page ?? 1);
      const limit = Math.min(MAX_FIND_LIMIT, Math.max(1, options.limit ?? 20));
      const offset = (page - 1) * limit;
      const conditions = this.buildConditions({ ...filter, ...this.tenantFilter() }, options);
      const itemQuery = (
        db as unknown as {
          select: () => { from: (table: unknown) => { where: (condition: unknown) => unknown } };
        }
      )
        .select()
        .from(this.table)
        .where(conditions);
      const ordered = this.applyStableOrder(itemQuery, options);
      const limited = this.applyNumberMethod(ordered, "limit", limit);
      const paged = this.applyNumberMethod(limited, "offset", offset);
      const [items, totalRes] = await Promise.all([
        paged as Promise<TRow[]>,
        (
          db as unknown as {
            select: (v: unknown) => {
              from: (t: unknown) => { where: (c: unknown) => Promise<{ count: number }[]> };
            };
          }
        )
          .select({ count: sql<number>`count(*)` })
          .from(this.table)
          .where(conditions),
      ]);
      const total = Number(totalRes[0]?.count ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return ok({
        items: items.map((r) => this.toDomain(r)),
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      });
    });
  }

  async paginateCursor(
    filter: Record<string, unknown> = {},
    options: CursorPaginationOptions = {},
  ): Promise<Result<CursorPaginatedResult<TEntity>, never>> {
    if (this.hasMissingTenantContext()) {
      return ok({
        items: [],
        limit: options.limit ?? 20,
        nextCursor: null,
        hasNextPage: false,
      });
    }
    return this.scopedRead(async (db) => {
      const limit = Math.min(MAX_FIND_LIMIT, Math.max(1, options.limit ?? 20));
      const cursorField = options.cursorField ?? "id";
      const direction = options.direction ?? "desc";
      const cols = this.table as unknown as Record<string, Parameters<typeof gt>[0]>;
      const col = cols[cursorField];

      const clauses: unknown[] = [];
      const baseConditions = this.buildConditions({ ...filter, ...this.tenantFilter() }, options);
      if (baseConditions) {
        clauses.push(baseConditions);
      }

      if (options.cursor && col) {
        clauses.push(direction === "desc" ? lt(col, options.cursor) : gt(col, options.cursor));
      }

      const conditions =
        clauses.length > 1 ? and(...(clauses as Parameters<typeof and>)) : clauses[0];

      const itemQuery = (
        db as unknown as {
          select: () => {
            from: (table: unknown) => {
              where: (condition: unknown) => {
                orderBy?: (...v: unknown[]) => unknown;
                limit: (n: number) => Promise<TRow[]>;
              };
              orderBy?: (...v: unknown[]) => { limit: (n: number) => Promise<TRow[]> };
              limit: (n: number) => Promise<TRow[]>;
            };
          };
        }
      )
        .select()
        .from(this.table);

      let queryCandidate: unknown = conditions
        ? (itemQuery as { where: (condition: unknown) => unknown }).where(conditions)
        : itemQuery;

      const orderCol = col ?? cols["id"];
      if (orderCol) {
        const orderClause = direction === "desc" ? desc(orderCol) : asc(orderCol);
        if (typeof (queryCandidate as { orderBy?: unknown }).orderBy === "function") {
          queryCandidate = (queryCandidate as { orderBy: (...v: unknown[]) => unknown }).orderBy(
            orderClause,
          );
        }
      }

      const limited = this.applyNumberMethod(queryCandidate, "limit", limit + 1);
      const rows = ((await limited) as TRow[]) ?? [];

      const hasNextPage = rows.length > limit;
      const itemsToReturn = hasNextPage ? rows.slice(0, limit) : rows;
      const lastItem = itemsToReturn[itemsToReturn.length - 1] as
        Record<string, unknown> | undefined;
      const nextCursor = hasNextPage && lastItem ? String(lastItem[cursorField] ?? "") : null;

      return ok({
        items: itemsToReturn.map((r) => this.toDomain(r)),
        limit,
        nextCursor,
        hasNextPage,
      });
    });
  }

  async updateById(
    id: Id,
    update: Record<string, unknown>,
    expectedVersion?: Date | number,
  ): Promise<Result<TEntity | null, { type: "CONFLICT" }>> {
    if (this.hasMissingTenantContext()) return ok(null);
    const db = this.getDb();
    const idCol = (this.table as unknown as Record<string, unknown>)["id"] as Parameters<
      typeof eq
    >[0];
    const tenantFilter = this.tenantFilter();
    const tenantClause =
      tenantFilter && (this.table as unknown as Record<string, unknown>)["tenantId"]
        ? eq(
            (this.table as unknown as Record<string, unknown>)["tenantId"] as Parameters<
              typeof eq
            >[0],
            tenantFilter["tenantId"] as string,
          )
        : undefined;

    let versionClause: unknown;
    let nextVersionPayload: Record<string, unknown> = {};

    if (typeof expectedVersion === "number") {
      const versionCol = ((this.table as unknown as Record<string, unknown>)["version"] ??
        (this.table as unknown as Record<string, unknown>)["authVersion"]) as
        Parameters<typeof eq>[0] | undefined;
      if (!versionCol) return err({ type: "CONFLICT" });
      versionClause = eq(versionCol, expectedVersion);
      nextVersionPayload = { version: expectedVersion + 1 };
    } else if (expectedVersion instanceof Date) {
      const updatedAtColumn = (this.table as unknown as Record<string, unknown>)["updatedAt"] as
        Parameters<typeof eq>[0] | undefined;
      if (!updatedAtColumn) return err({ type: "CONFLICT" });
      versionClause = sql`date_trunc('milliseconds', ${updatedAtColumn}) = date_trunc('milliseconds', ${expectedVersion}::timestamptz)`;
    }

    const whereClause = tenantClause
      ? and(eq(idCol, id as string), tenantClause)
      : eq(idCol, id as string);
    const guardedWhereClause = versionClause
      ? and(whereClause, versionClause as Parameters<typeof and>[0])
      : whereClause;
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<TRow[]> } };
        };
      }
    )
      .update(this.table)
      .set({ ...update, ...nextVersionPayload, updatedAt: new Date() } as unknown as Record<
        string,
        unknown
      >)
      .where(guardedWhereClause)
      .returning();
    const row = rows[0] ?? null;
    if (expectedVersion && !row) return err({ type: "CONFLICT" });
    return ok(
      row && !(row as unknown as Record<string, unknown>)["deletedAt"] ? this.toDomain(row) : null,
    );
  }

  /**
   * Explicit optimistic-concurrency entry point for collaborative aggregates.
   * Supports integer versioning or Date updatedAt with millisecond precision.
   */
  async updateByIdWithVersion(
    id: Id,
    expectedVersion: Date | number,
    update: Record<string, unknown>,
  ): Promise<Result<TEntity | null, { type: "CONFLICT" }>> {
    return this.updateById(id, update, expectedVersion);
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<Result<TEntity | null, { type: "CONFLICT" }>> {
    if (this.hasMissingTenantContext()) return ok(null);
    const db = this.getDb();
    const conditions = this.buildConditions({ ...filter, ...this.tenantFilter() });
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<TRow[]> } };
        };
      }
    )
      .update(this.table)
      .set({ ...update, updatedAt: new Date() } as unknown as Record<string, unknown>)
      .where(conditions as never)
      .returning();
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
  }

  async softDeleteById(id: Id): Promise<Result<TEntity | null, never>> {
    if (this.hasMissingTenantContext()) return ok(null);
    const db = this.getDb();
    const idCol = (this.table as unknown as Record<string, unknown>)["id"] as Parameters<
      typeof eq
    >[0];
    const tenantFilter = this.tenantFilter();
    const tenantClause =
      tenantFilter && (this.table as unknown as Record<string, unknown>)["tenantId"]
        ? eq(
            (this.table as unknown as Record<string, unknown>)["tenantId"] as Parameters<
              typeof eq
            >[0],
            tenantFilter["tenantId"] as string,
          )
        : undefined;
    const deletedClause = isNull(
      (this.table as unknown as Record<string, unknown>)["deletedAt"] as Parameters<
        typeof isNull
      >[0],
    );
    const whereClause = tenantClause
      ? and(eq(idCol, id as string), tenantClause, deletedClause)
      : and(eq(idCol, id as string), deletedClause);
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<TRow[]> } };
        };
      }
    )
      .update(this.table)
      .set({ deletedAt: new Date(), updatedAt: new Date() } as unknown as Record<string, unknown>)
      .where(whereClause)
      .returning();
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
  }

  async deleteById(id: Id): Promise<Result<boolean, never>> {
    if (this.hasMissingTenantContext()) return ok(false);
    const db = this.getDb();
    const idCol = (this.table as unknown as Record<string, unknown>)["id"] as Parameters<
      typeof eq
    >[0];
    const tenantFilter = this.tenantFilter();
    const tenantClause =
      tenantFilter && (this.table as unknown as Record<string, unknown>)["tenantId"]
        ? eq(
            (this.table as unknown as Record<string, unknown>)["tenantId"] as Parameters<
              typeof eq
            >[0],
            tenantFilter["tenantId"] as string,
          )
        : undefined;
    const whereClause = tenantClause
      ? and(eq(idCol, id as string), tenantClause)
      : eq(idCol, id as string);
    const rows = await (
      db as unknown as {
        delete: (t: unknown) => { where: (c: unknown) => { returning: () => Promise<TRow[]> } };
      }
    )
      .delete(this.table)
      .where(whereClause)
      .returning();
    return ok(rows.length > 0);
  }
}

export abstract class TenantScopedRepository<TEntity, TRow> extends BaseRepository<TEntity, TRow> {
  constructor(
    table: import("drizzle-orm/pg-core").PgTable,
    database: import("../database.service").DatabaseService,
    tenantContext: import("../tenancy/tenant-context.service").TenantContextService,
  ) {
    super(table, database, tenantContext, true);
  }
}
