import { Injectable } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { organizations, type OrganizationRow } from "../schemas/tenancy.schema";
import { Organization } from "../../domain/entities/tenancy.entity";
import type { Result } from "neverthrow";

@Injectable()
export class OrganizationsRepository extends BaseRepository<Organization, OrganizationRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(organizations, database, tenantContext, false);
  }

  protected toDomain(row: OrganizationRow): Organization {
    return Organization.fromPersistence({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  findBySlug(slug: string): Promise<Result<Organization | null, never>> {
    return this.findOne({ slug });
  }

  async findByIds(ids: string[]): Promise<Result<Organization[], never>> {
    if (ids.length === 0)
      return this.find({ id: "__none__" } as unknown as Record<string, unknown>);
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => { where: (c: unknown) => Promise<OrganizationRow[]> };
        };
      }
    )
      .select()
      .from(organizations)
      .where(inArray(organizations.id, ids));
    return {
      isOk: () => true,
      isErr: () => false,
      value: rows.map((r) => this.toDomain(r)),
      error: undefined,
    } as unknown as Result<Organization[], never>;
  }
}
