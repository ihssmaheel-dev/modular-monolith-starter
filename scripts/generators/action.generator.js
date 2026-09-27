const fs = require("node:fs");
const path = require("node:path");
const {
  toPascalCase,
  toCamelCase,
  toKebabCase,
  toPlural,
  ensureDir,
  writeFileIfMissing,
} = require("./utils");

/**
 * Scaffolds a single Command or Query into an existing module,
 * wiring Application, Presentation (REST + oRPC), Parity Test,
 * Contracts, and API Client SDK in one atomic operation.
 */
function generateAction({
  rootPath = process.cwd(),
  moduleName,
  actionName,
  type = "command", // "command" | "query"
  isCollection = false,
}) {
  const isCommand = type === "command";
  const typePlural = isCommand ? "commands" : "queries";
  const TypePascal = isCommand ? "Command" : "Query";
  const httpMethod = isCommand ? "POST" : "GET";

  const actionKebab = toKebabCase(actionName);
  const ActionPascal = toPascalCase(actionKebab);
  const actionCamel = toCamelCase(actionKebab);

  const modulePath = path.join(rootPath, "apps", "api", "src", "modules", moduleName);
  if (!fs.existsSync(modulePath)) {
    throw new Error(
      `Module '${moduleName}' does not exist at ${modulePath}. Run 'pnpm generate:module ${moduleName}' first.`,
    );
  }

  // Detect entity and repository in the module
  const { entityName, EntityPascal, featurePlural, FeaturePlural, repoFile, repoClass } =
    inspectModule(modulePath, moduleName);

  // Check if EntityPascalResponseSchema is defined in schemas
  const schemaFile = path.join(
    rootPath,
    "packages",
    "contracts",
    "src",
    "schemas",
    `${entityName}.schema.ts`,
  );
  let hasEntityResponseSchema = false;
  if (fs.existsSync(schemaFile)) {
    const schemaContent = fs.readFileSync(schemaFile, "utf8");
    if (schemaContent.includes(`${EntityPascal}ResponseSchema`)) {
      hasEntityResponseSchema = true;
    }
  }
  const responseSchemaName = hasEntityResponseSchema
    ? `${EntityPascal}ResponseSchema`
    : "EmptyResponseSchema";
  const responseDtoName = hasEntityResponseSchema ? `${EntityPascal}ResponseDto` : "void";

  console.log(`\n=======================================================`);
  console.log(`  Surgical ${TypePascal} Scaffolder`);
  console.log(`  Module:  ${moduleName} (${EntityPascal})`);
  console.log(`  Action:  ${actionKebab} (${ActionPascal}${TypePascal})`);
  console.log(
    `  Route:   ${httpMethod} /${featurePlural}${isCollection ? "" : "/:id"}/${actionKebab}`,
  );
  console.log(`=======================================================\n`);

  // 1. Generate Application Layer (Command / Query + Vitest Test)
  generateActionApplication({
    modulePath,
    moduleName,
    actionKebab,
    ActionPascal,
    actionCamel,
    isCommand,
    entityName,
    EntityPascal,
    featurePlural,
    FeaturePlural,
    repoFile,
    repoClass,
    isCollection,
  });

  // 2. Wire into NestJS Module
  wireIntoModule({
    modulePath,
    moduleName,
    actionKebab,
    ActionPascal,
    TypePascal,
    typePlural,
  });

  // 3. Wire into Contracts (@repo/contracts)
  wireIntoContracts({
    rootPath,
    moduleName,
    entityName,
    featurePlural,
    actionKebab,
    ActionPascal,
    actionCamel,
    httpMethod,
    isCollection,
    responseSchemaName,
    hasEntityResponseSchema,
  });

  // 4. Wire into API Client (@repo/api-client)
  wireIntoClient({
    rootPath,
    moduleName,
    featurePlural,
    actionKebab,
    actionCamel,
    httpMethod,
    isCollection,
    responseSchemaName,
    responseDtoName,
    hasEntityResponseSchema,
  });

  // 5. Wire into Presentation (REST + oRPC Controllers + Parity Test)
  wireIntoPresentation({
    modulePath,
    actionKebab,
    ActionPascal,
    actionCamel,
    TypePascal,
    typePlural,
    isCommand,
    featurePlural,
    isCollection,
    entityName,
    EntityPascal,
    responseSchemaName,
    responseDtoName,
    hasEntityResponseSchema,
  });

  console.log(`\n=======================================================`);
  console.log(`  Successfully generated ${ActionPascal}${TypePascal}!`);
  console.log(`=======================================================`);
  console.log(`\nNext Steps:`);
  console.log(` 1. Run 'pnpm check:fast' to verify compliance in <200ms.`);
  console.log(
    ` 2. Run 'pnpm --filter api test:unit src/modules/${moduleName}/application/${typePlural}/${actionKebab}.${type}.test.ts' to verify.`,
  );
  console.log(` 3. Implement domain-specific business logic in ${actionKebab}.${type}.ts.\n`);
}

function inspectModule(modulePath, moduleName) {
  let entityName = moduleName.replace(/s$/, "");
  let EntityPascal = toPascalCase(entityName);
  let featurePlural = toPlural(entityName);
  let FeaturePlural = toPascalCase(featurePlural);
  let repoFile = `${featurePlural}.repository`;
  let repoClass = `${FeaturePlural}Repository`;

  const entitiesDir = path.join(modulePath, "domain", "entities");
  if (fs.existsSync(entitiesDir)) {
    const files = fs.readdirSync(entitiesDir).filter((f) => f.endsWith(".entity.ts"));
    if (files.length > 0) {
      entityName = files[0].replace(".entity.ts", "");
      EntityPascal = toPascalCase(entityName);
      featurePlural = toPlural(entityName);
      FeaturePlural = toPascalCase(featurePlural);
    }
  }

  const reposDir = path.join(modulePath, "infrastructure", "repositories");
  if (fs.existsSync(reposDir)) {
    const files = fs.readdirSync(reposDir).filter((f) => f.endsWith(".repository.ts"));
    if (files.length > 0) {
      repoFile = files[0].replace(".ts", "");
      const content = fs.readFileSync(path.join(reposDir, files[0]), "utf8");
      const match = content.match(/export class (\w+Repository)/);
      if (match) repoClass = match[1];
    }
  }

  return { entityName, EntityPascal, featurePlural, FeaturePlural, repoFile, repoClass };
}

function generateActionApplication({
  modulePath,
  actionKebab,
  ActionPascal,
  isCommand,
  entityName,
  EntityPascal,
  featurePlural,
  repoFile,
  repoClass,
  isCollection,
}) {
  const targetDir = path.join(modulePath, "application", isCommand ? "commands" : "queries");
  ensureDir(targetDir);

  const fileExt = isCommand ? "command" : "query";
  const filePath = path.join(targetDir, `${actionKebab}.${fileExt}.ts`);
  const testPath = path.join(targetDir, `${actionKebab}.${fileExt}.test.ts`);

  if (isCommand) {
    const commandContent = `import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { ${EntityPascal} } from "../../domain/entities/${entityName}.entity";
import { ${repoClass} } from "../../infrastructure/repositories/${repoFile}";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class ${ActionPascal}Command {
  constructor(
    private readonly repository: ${repoClass},
    private readonly outbox: OutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly database: DatabaseService,
  ) {}

  async execute(
    ${isCollection ? "" : "id: string,\n    "}actor: AuthenticatedUser,
  ): Promise<Result<${EntityPascal}, { type: "${EntityPascal.toUpperCase()}_NOT_FOUND" } | { type: "EVENT_DISPATCH_FAILED" } | { type: "TRANSACTION_FAILED" } | Error>> {
    return this.database.withResultTransaction(async () => {
      ${
        isCollection
          ? `// Custom collection command logic
      const result = await this.repository.findMany();
      if (result.isErr()) return err(result.error);
      const entity = result.value[0];
      if (!entity) return err({ type: "${EntityPascal.toUpperCase()}_NOT_FOUND" });`
          : `const existing = await this.repository.findById(id);
      if (existing.isErr()) return err(existing.error);
      if (!existing.value) return err({ type: "${EntityPascal.toUpperCase()}_NOT_FOUND" });

      const updated = await this.repository.updateById(id, {});
      if (updated.isErr()) return err(updated.error);
      if (!updated.value) return err({ type: "${EntityPascal.toUpperCase()}_NOT_FOUND" });
      const entity = updated.value;`
      }

      const dispatched = await this.outbox.dispatchTenant(
        "${entityName}.${actionKebab}",
        { ${isCollection ? "" : "id, "}actorId: actor.sub, tenantId: entity.tenantId },
      );
      if (dispatched.isErr()) return err({ type: "EVENT_DISPATCH_FAILED" });

      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", {
        collectionName: "${featurePlural}",
        documentId: entity.id,
        action: "UPDATE",
        actorId: actor.sub,
        tenantId: entity.tenantId,
        before: null,
        after: { id: entity.id },
      });

      return ok(entity);
    });
  }
}
`;

    const commandTestContent = `import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import { ${ActionPascal}Command } from "./${actionKebab}.command";
import { ${EntityPascal} } from "../../domain/entities/${entityName}.entity";
import type { ${repoClass} } from "../../infrastructure/repositories/${repoFile}";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import type { DatabaseService } from "../../../../infrastructure/database";

describe("${ActionPascal}Command", () => {
  it("executes successfully and dispatches event", async () => {
    const mockEntity = ${EntityPascal}.fromPersistence({
      id: "1",
      name: "Test",
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: "tenant-1",
    });
    const repo = {
      findById: vi.fn().mockResolvedValue(ok(mockEntity)),
      findMany: vi.fn().mockResolvedValue(ok([mockEntity])),
      updateById: vi.fn().mockResolvedValue(ok(mockEntity)),
    } as unknown as ${repoClass};
    const outbox = { dispatchTenant: vi.fn().mockResolvedValue(ok(undefined)) } as unknown as OutboxService;
    const eventEmitter = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const database = {
      withResultTransaction: vi.fn((fn) => fn()),
      emitAfterCommit: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseService;

    const cmd = new ${ActionPascal}Command(repo, outbox, eventEmitter, database);
    const res = await cmd.execute(${isCollection ? "" : '"1", '}{ sub: "u1", email: "a@b.com", role: "user" });
    expect(res.isOk()).toBe(true);
    expect(outbox.dispatchTenant).toHaveBeenCalledWith("${entityName}.${actionKebab}", expect.any(Object));
  });
});
`;

    writeFileIfMissing(filePath, commandContent);
    writeFileIfMissing(testPath, commandTestContent);
  } else {
    const queryContent = `import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { ${EntityPascal} } from "../../domain/entities/${entityName}.entity";
import { ${repoClass} } from "../../infrastructure/repositories/${repoFile}";

@Injectable()
export class ${ActionPascal}Query {
  constructor(private readonly repository: ${repoClass}) {}

  async execute(
    ${isCollection ? "" : "id: string,\n    "}_actor: AuthenticatedUser,
  ): Promise<Result<${EntityPascal}, { type: "${EntityPascal.toUpperCase()}_NOT_FOUND" } | Error>> {
    ${
      isCollection
        ? `const result = await this.repository.findMany();
    if (result.isErr()) return err(result.error);
    const entity = result.value[0];
    if (!entity) return err({ type: "${EntityPascal.toUpperCase()}_NOT_FOUND" });
    return ok(entity);`
        : `const result = await this.repository.findById(id);
    if (result.isErr()) return err(result.error);
    if (!result.value) return err({ type: "${EntityPascal.toUpperCase()}_NOT_FOUND" });
    return ok(result.value);`
    }
  }
}
`;

    const queryTestContent = `import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { ${ActionPascal}Query } from "./${actionKebab}.query";
import { ${EntityPascal} } from "../../domain/entities/${entityName}.entity";
import type { ${repoClass} } from "../../infrastructure/repositories/${repoFile}";

describe("${ActionPascal}Query", () => {
  it("executes successfully", async () => {
    const mockEntity = ${EntityPascal}.fromPersistence({
      id: "1",
      name: "Test",
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: "tenant-1",
    });
    const repo = {
      findById: vi.fn().mockResolvedValue(ok(mockEntity)),
      findMany: vi.fn().mockResolvedValue(ok([mockEntity])),
    } as unknown as ${repoClass};

    const query = new ${ActionPascal}Query(repo);
    const res = await query.execute(${isCollection ? "" : '"1", '}{ sub: "u1", email: "a@b.com", role: "user" });
    expect(res.isOk()).toBe(true);
  });
});
`;

    writeFileIfMissing(filePath, queryContent);
    writeFileIfMissing(testPath, queryTestContent);
  }
}

function wireIntoModule({
  modulePath,
  moduleName,
  actionKebab,
  ActionPascal,
  TypePascal,
  typePlural,
}) {
  const moduleFile = path.join(modulePath, `${moduleName}.module.ts`);
  if (!fs.existsSync(moduleFile)) return;

  const className = `${ActionPascal}${TypePascal}`;
  const importLine = `import { ${className} } from "./application/${typePlural}/${actionKebab}.${TypePascal.toLowerCase()}";`;

  let source = fs.readFileSync(moduleFile, "utf8");
  if (!source.includes(importLine)) {
    source = `${importLine}\n${source}`;
  }

  // Add to providers array
  if (source.includes("providers: [") && !source.includes(`    ${className},`)) {
    source = source.replace("providers: [", `providers: [\n    ${className},`);
  }

  // Add to exports array if exports exist
  if (source.includes("exports: [") && !source.includes(`    ${className},`)) {
    source = source.replace("exports: [", `exports: [\n    ${className},`);
  }

  fs.writeFileSync(moduleFile, source, "utf8");
  console.log(`  [update] Registered ${className} in ${path.relative(process.cwd(), moduleFile)}`);
}

function wireIntoContracts({
  rootPath,
  moduleName,
  entityName,
  featurePlural,
  actionKebab,
  ActionPascal,
  actionCamel,
  httpMethod,
  isCollection,
  responseSchemaName,
  hasEntityResponseSchema,
}) {
  const contractsDir = path.join(rootPath, "packages", "contracts", "src", "contracts");
  const contractFiles = [
    path.join(contractsDir, `${featurePlural}.contract.ts`),
    path.join(contractsDir, `${moduleName}.contract.ts`),
  ];

  const contractPath = contractFiles.find((f) => fs.existsSync(f));
  if (!contractPath) return;

  let source = fs.readFileSync(contractPath, "utf8");
  if (source.includes(`${actionCamel}:`)) return;

  if (!source.includes(responseSchemaName)) {
    if (hasEntityResponseSchema) {
      source = `import { ${responseSchemaName} } from "../schemas/${entityName}.schema";\n${source}`;
    } else {
      source = `import { EmptyResponseSchema } from "../schemas/common.schema";\n${source}`;
    }
  }

  const subPath = isCollection ? `/${actionKebab}` : `/{id}/${actionKebab}`;
  const inputSchema = isCollection ? `z.object({}).optional()` : `z.object({ id: z.string() })`;

  const procedureDef = `  ${actionCamel}: oc
    .route({ method: "${httpMethod}", path: "${subPath}", summary: "${ActionPascal}" })
    .input(${inputSchema})
    .output(${responseSchemaName}),\n});`;

  // Replace closing router bracket
  source = source.replace(/\}\);\s*$/, procedureDef);
  fs.writeFileSync(contractPath, source, "utf8");
  console.log(
    `  [update] Added ${actionCamel} procedure to ${path.relative(process.cwd(), contractPath)}`,
  );
}

function wireIntoClient({
  rootPath,
  moduleName,
  featurePlural,
  actionKebab,
  actionCamel,
  httpMethod,
  isCollection,
  responseSchemaName,
  responseDtoName,
  hasEntityResponseSchema,
}) {
  const clientDir = path.join(rootPath, "packages", "api-client", "src", "subclients");
  const clientFiles = [
    path.join(clientDir, `${featurePlural}.ts`),
    path.join(clientDir, `${moduleName}.ts`),
  ];

  const clientPath = clientFiles.find((f) => fs.existsSync(f));
  if (!clientPath) return;

  let source = fs.readFileSync(clientPath, "utf8");
  if (source.includes(`${actionCamel}:`)) return;

  if (!source.includes(responseSchemaName)) {
    source = `import { ${responseSchemaName} } from "@repo/contracts";\n${source}`;
  }
  if (hasEntityResponseSchema && !source.includes(responseDtoName)) {
    source = `import type { ${responseDtoName} } from "@repo/contracts";\n${source}`;
  }

  const subPath = isCollection
    ? `/${actionKebab}`
    : `/\${encodeURIComponent(req.params.id)}/${actionKebab}`;
  const returnType = hasEntityResponseSchema ? `<${responseDtoName}>` : "<void>";
  const methodDef = `    ${actionCamel}: (${isCollection ? "" : "req: { params: { id: string } }"}) =>
      orpc
        ? orpcResponse(
            () => orpc.${featurePlural}.${actionCamel}(${isCollection ? "{}" : "{ id: req.params.id }"}),
            200,
            ${responseSchemaName},
          )
        : fetchFn${returnType}(
            \`/${featurePlural}${subPath}\`,
            { method: "${httpMethod}" },
            ${responseSchemaName},
          ),`;

  source = source.trimEnd().replace(/;?\s*\}\s*$/, "");
  source = source.trimEnd().replace(/,$/, "");
  source = `${source},\n${methodDef}\n  };\n}\n`;
  fs.writeFileSync(clientPath, source, "utf8");
  console.log(
    `  [update] Added ${actionCamel} method to ${path.relative(process.cwd(), clientPath)}`,
  );
}

function wireIntoPresentation({
  modulePath,
  actionKebab,
  ActionPascal,
  actionCamel,
  TypePascal,
  typePlural,
  isCommand,
  featurePlural,
  isCollection,
  entityName,
  EntityPascal,
  responseSchemaName,
  responseDtoName,
  hasEntityResponseSchema,
}) {
  // 1. Controller
  const controllersDir = path.join(modulePath, "presentation", "controllers");
  if (fs.existsSync(controllersDir)) {
    const controllerFiles = fs
      .readdirSync(controllersDir)
      .filter((f) => f.endsWith(".controller.ts") && !f.endsWith(".test.ts"));
    if (controllerFiles.length > 0) {
      const controllerPath = path.join(controllersDir, controllerFiles[0]);
      updateRestController(controllerPath, {
        actionKebab,
        ActionPascal,
        actionCamel,
        TypePascal,
        typePlural,
        isCommand,
        featurePlural,
        isCollection,
        entityName,
        EntityPascal,
        responseSchemaName,
        responseDtoName,
        hasEntityResponseSchema,
      });
    }
  }

  // 2. oRPC Controller
  const orpcDir = path.join(modulePath, "presentation", "orpc");
  if (fs.existsSync(orpcDir)) {
    const orpcFiles = fs.readdirSync(orpcDir).filter((f) => f.endsWith(".orpc.controller.ts"));
    if (orpcFiles.length > 0) {
      const orpcPath = path.join(orpcDir, orpcFiles[0]);
      updateOrpcController(orpcPath, {
        actionKebab,
        actionCamel,
        isCommand,
        featurePlural,
        isCollection,
      });
    }
  }

  // 3. Parity Test
  if (fs.existsSync(controllersDir)) {
    const parityFiles = fs.readdirSync(controllersDir).filter((f) => f.endsWith(".parity.test.ts"));
    if (parityFiles.length > 0) {
      const parityPath = path.join(controllersDir, parityFiles[0]);
      updateParityTest(parityPath, actionCamel);
    }
  }
}

function updateRestController(
  controllerPath,
  {
    actionKebab,
    ActionPascal,
    actionCamel,
    TypePascal,
    typePlural,
    isCommand,
    featurePlural,
    isCollection,
    EntityPascal,
    responseSchemaName,
    responseDtoName,
    hasEntityResponseSchema,
  },
) {
  let source = fs.readFileSync(controllerPath, "utf8");
  const className = `${ActionPascal}${TypePascal}`;
  const propName = `${actionCamel}${TypePascal}`;
  const importLine = `import { ${className} } from "../../application/${typePlural}/${actionKebab}.${TypePascal.toLowerCase()}";`;

  if (!source.includes(importLine)) {
    source = `${importLine}\n${source}`;
  }

  // Ensure mapper import
  const mapperFunc = `to${EntityPascal}Response`;
  if (hasEntityResponseSchema && !source.includes(mapperFunc)) {
    source = `import { ${mapperFunc} } from "../mappers/${featurePlural}.mapper";\n${source}`;
  }

  // Ensure response schema and Dto imports
  if (!source.includes(responseSchemaName)) {
    source = `import { ${responseSchemaName} } from "@repo/contracts";\n${source}`;
  }
  if (hasEntityResponseSchema && !source.includes(responseDtoName)) {
    source = `import type { ${responseDtoName} } from "@repo/contracts";\n${source}`;
  }

  // Ensure ResponseSchema and ZodValidationPipe imports
  if (!source.includes("ResponseSchema")) {
    source = `import { ResponseSchema } from "../../../../common";\n${source}`;
  }
  if (!source.includes("ZodValidationPipe")) {
    source = `import { ZodValidationPipe } from "../../../../common";\n${source}`;
  }
  if (!source.includes("z.string()")) {
    if (!source.includes('import { z } from "zod";')) {
      source = `import { z } from "zod";\n${source}`;
    }
  }

  // Inject into constructor before closing constructor paren
  if (!source.includes(`private readonly ${propName}: ${className}`)) {
    const ctorRegex = /constructor\s*\(([\s\S]*?)\)\s*\{/;
    const ctorMatch = source.match(ctorRegex);
    if (ctorMatch) {
      const ctorArgs = ctorMatch[1];
      const updatedArgs = `${ctorArgs.trimEnd()}\n    private readonly ${propName}: ${className},\n  `;
      source = source.replace(ctorMatch[0], `constructor(${updatedArgs}) {`);
    }
  }

  // Add endpoint method before last class bracket
  if (!source.includes(`async ${actionCamel}(`)) {
    const routeDecorator = isCommand
      ? `@Post("${isCollection ? actionKebab : `:id/${actionKebab}`}")\n  @Idempotent()`
      : `@Get("${isCollection ? actionKebab : `:id/${actionKebab}`}")`;
    const permAction = isCommand ? "update" : "read";

    const endpointCode = `
  ${routeDecorator}
  @RequirePermission("${featurePlural}:${permAction}")
  @ResponseSchema(${responseSchemaName})
  async ${actionCamel}(
    ${isCollection ? "" : `@Param("id", new ZodValidationPipe(z.string().min(1))) id: string,\n    `}@Req() req: FastifyRequest,
  ): Promise<${responseDtoName}> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.${propName}.execute(${isCollection ? "" : "id, "}actor);
    ${
      hasEntityResponseSchema
        ? `const entity = handleResult(result, {}, this.i18n, lang);\n    return ${mapperFunc}(entity);`
        : `handleResult(result, {}, this.i18n, lang);`
    }
  }
}
`;
    source = source.replace(/\}\s*$/, endpointCode);
  }

  fs.writeFileSync(controllerPath, source, "utf8");
  console.log(
    `  [update] Added ${actionCamel} route to ${path.relative(process.cwd(), controllerPath)}`,
  );
}

function updateOrpcController(orpcPath, { actionCamel, isCommand, featurePlural, isCollection }) {
  let source = fs.readFileSync(orpcPath, "utf8");
  if (source.includes(`${actionCamel}(@Req()`)) return;

  // Extract contract variable and controller property name
  const contractMatch = source.match(/@Implement\((\w+)\./);
  const contractVar = contractMatch ? contractMatch[1] : `${featurePlural}Contract`;

  const controllerPropMatch = source.match(/this\.(\w+Controller)\./);
  const controllerProp = controllerPropMatch
    ? controllerPropMatch[1]
    : `${featurePlural}Controller`;

  const permAction = isCommand ? "update" : "read";
  const idempotentDecorator = isCommand ? "@Idempotent()\n  " : "";

  const orpcMethod = `
  @Implement(${contractVar}.${actionCamel})
  ${idempotentDecorator}@RequirePermission("${featurePlural}:${permAction}")
  ${actionCamel}(@Req() request: FastifyRequest) {
    return implement(${contractVar}.${actionCamel}).handler(({ input }) =>
      invokeOrpc(
        () => this.${controllerProp}.${actionCamel}(${isCollection ? "" : "input.id, "}request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
`;

  source = source.replace(/\}\s*$/, orpcMethod);
  fs.writeFileSync(orpcPath, source, "utf8");
  console.log(
    `  [update] Added ${actionCamel} oRPC handler to ${path.relative(process.cwd(), orpcPath)}`,
  );
}

function updateParityTest(parityPath, actionCamel) {
  let source = fs.readFileSync(parityPath, "utf8");
  if (source.includes(`"${actionCamel}"`)) return;

  // Append entry to routePairs array
  const pairEntry = `  ["${actionCamel}", "${actionCamel}", "${actionCamel}"],\n]);`;
  source = source.replace(/\]\s*\);\s*(describeRouteParity|\/\*)/, `${pairEntry}\n\n$1`);
  fs.writeFileSync(parityPath, source, "utf8");
  console.log(
    `  [update] Added ${actionCamel} parity check to ${path.relative(process.cwd(), parityPath)}`,
  );
}

module.exports = { generateAction };
