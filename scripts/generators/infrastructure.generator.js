const path = require("path");
const { writeFileIfMissing } = require("./utils");

function generateInfrastructure({ modulePath, feature, Feature, featurePlural, FeaturePlural }) {
  const schemaContent = `import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ${feature}Table = pgTable(
  "${featurePlural}",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("${feature}_tenant_id_idx").on(table.tenantId),
    index("${feature}_created_by_idx").on(table.createdBy),
  ],
);

export type ${Feature}Row = typeof ${feature}Table.$inferSelect;
export type New${Feature}Row = typeof ${feature}Table.$inferInsert;
`;

  const repositoryContent = `import { Injectable } from "@nestjs/common";
import { BaseRepository, DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import { ${feature}Table, type ${Feature}Row } from "../schemas/${feature}.schema";

@Injectable()
export class ${FeaturePlural}Repository extends BaseRepository<${Feature}, ${Feature}Row> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(${feature}Table, database, tenantContext, true);
  }

  protected toDomain(row: ${Feature}Row): ${Feature} {
    return ${Feature}.fromPersistence({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdBy: row.createdBy ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tenantId: row.tenantId ?? undefined,
    });
  }
}
`;

  writeFileIfMissing(
    path.join(modulePath, "infrastructure", "schemas", `${feature}.schema.ts`),
    schemaContent,
  );
  writeFileIfMissing(
    path.join(modulePath, "infrastructure", "repositories", `${featurePlural}.repository.ts`),
    repositoryContent,
  );
}

module.exports = { generateInfrastructure };
