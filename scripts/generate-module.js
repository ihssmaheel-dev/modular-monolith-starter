const fs = require("fs");
const path = require("path");

const moduleName = process.argv[2];

if (!moduleName) {
  console.error("Please provide a module name. Usage: pnpm generate:module <name>");
  process.exit(1);
}

if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(moduleName)) {
  console.error("Module names must use lowercase kebab-case.");
  process.exit(1);
}

const basePath = path.join(__dirname, "../apps/api/src/modules", moduleName);
const pascalName = toPascalCase(moduleName);

if (fs.existsSync(basePath)) {
  console.error(`Module '${moduleName}' already exists.`);
  process.exit(1);
}

const folders = [
  "presentation/controllers",
  "presentation/orpc",
  "presentation/mappers",
  "presentation/error-maps",
  "application/commands",
  "application/queries",
  "application/listeners",
  "domain/entities",
  "domain/value-objects",
  "domain/events",
  "domain/errors",
  "infrastructure/schemas",
  "infrastructure/repositories",
];

folders.forEach((folder) => {
  fs.mkdirSync(path.join(basePath, folder), { recursive: true });
});

// Keep the module scaffold compilable while the domain is being designed. The
// full vertical-slice generator adds contracts, policies, commands, tests, and
// a web slice once the first feature has a defined contract.
const entityContent = `export class ${pascalName} {
  private constructor(public readonly id: string, public readonly tenantId?: string) {}

  static fromPersistence(data: { id: string; tenantId?: string }): ${pascalName} {
    return new ${pascalName}(data.id, data.tenantId);
  }
}
`;
fs.writeFileSync(path.join(basePath, "domain/entities", `${moduleName}.entity.ts`), entityContent);

const moduleReadme = `# ${pascalName} module\n\nThis is a compilable boundary scaffold. Define the first feature with:\n\n'pnpm generate:feature ${moduleName} <feature>'\n\nBefore registering the module, add contracts, authorization policies, migrations, localized messages,\nand unit/integration/E2E coverage. Keep persistence tables private to this module.\n`;
fs.writeFileSync(path.join(basePath, "README.md"), moduleReadme);

const moduleFileContent = `// GENERATED_MODULE_SCAFFOLD: feature generation may replace this file.
import { Module } from "@nestjs/common";
import { ${pascalName}Controller } from "./presentation/controllers/${moduleName}.controller";
import { ${pascalName}Repository } from "./infrastructure/repositories/${moduleName}.repository";
import { Create${pascalName}Command } from "./application/commands/create-${moduleName}.command";
import { Get${pascalName}Query } from "./application/queries/get-${moduleName}.query";

@Module({
  controllers: [${pascalName}Controller],
  providers: [
    ${pascalName}Repository,
    Create${pascalName}Command,
    Get${pascalName}Query,
  ],
  exports: [
    Create${pascalName}Command,
    Get${pascalName}Query,
  ],
})
export class ${pascalName}Module {}
`;

fs.writeFileSync(path.join(basePath, `${moduleName}.module.ts`), moduleFileContent);

const controllerContent = `import { Controller } from "@nestjs/common";

@Controller("${moduleName}")
export class ${pascalName}Controller {}
`;
fs.writeFileSync(
  path.join(basePath, "presentation/controllers", `${moduleName}.controller.ts`),
  controllerContent,
);

const commandContent = `import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";

@Injectable()
export class Create${pascalName}Command {
  async execute(): Promise<Result<void, never>> {
    return ok(undefined);
  }
}
`;
fs.writeFileSync(
  path.join(basePath, "application/commands", `create-${moduleName}.command.ts`),
  commandContent,
);

const queryContent = `import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";

@Injectable()
export class Get${pascalName}Query {
  async execute(): Promise<Result<void, never>> {
    return ok(undefined);
  }
}
`;
fs.writeFileSync(
  path.join(basePath, "application/queries", `get-${moduleName}.query.ts`),
  queryContent,
);

const repositoryContent = `import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { ${moduleName}Table, type ${pascalName}Row } from "../schemas/${moduleName}.schema";
import { ${pascalName} } from "../../domain/entities/${moduleName}.entity";

@Injectable()
export class ${pascalName}Repository extends BaseRepository<${pascalName}, ${pascalName}Row> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(${moduleName}Table, database, tenantContext, true);
  }

  protected toDomain(row: ${pascalName}Row): ${pascalName} {
    return ${pascalName}.fromPersistence(row as unknown as never);
  }
}
`;
fs.writeFileSync(
  path.join(basePath, "infrastructure/repositories", `${moduleName}.repository.ts`),
  repositoryContent,
);

const schemaContent = `import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const ${moduleName}Table = pgTable(
  "${moduleName}",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("${moduleName}_tenant_id_idx").on(t.tenantId)],
);

export type ${pascalName}Row = typeof ${moduleName}Table.$inferSelect;
`;
fs.writeFileSync(
  path.join(basePath, "infrastructure/schemas", `${moduleName}.schema.ts`),
  schemaContent,
);

console.log(`Successfully generated strict architecture for module '${moduleName}'!`);

function toPascalCase(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
