const fs = require("fs");
const path = require("path");
const { writeFileIfMissing, writeFileIfMissingOrScaffold } = require("./utils");

function generatePresentation({
  modulePath,
  moduleName,
  ModuleName,
  feature,
  Feature,
  featurePlural,
  FeaturePlural,
}) {
  const mapperContent = `import type { ${Feature}ResponseDto } from "@repo/contracts";
import type { ${Feature} } from "../../domain/entities/${feature}.entity";

export function to${Feature}Response(entity: ${Feature}): ${Feature}ResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    tenantId: entity.tenantId,
  };
}
`;

  const controllerContent = `import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  Idempotent,
  RequirePermission,
  ResponseSchema,
  ZodValidationPipe,
  requireAuthenticatedUser,
} from "../../../../common";
import { handleResult } from "../../../../common/utils/presentation.utils";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import type {
  Create${Feature}Dto,
  ${Feature}ListResponseDto,
  ${Feature}ResponseDto,
  PaginationQuery,
  Update${Feature}Dto,
} from "@repo/contracts";
import {
  Create${Feature}Schema,
  PaginationQuerySchema,
  Update${Feature}Schema,
} from "@repo/contracts";
import {
  ${Feature}ListResponseSchema,
  ${Feature}ResponseSchema,
  EmptyResponseSchema,
} from "@repo/contracts";
import { Create${Feature}Command } from "../../application/commands/create-${feature}.command";
import { Update${Feature}Command } from "../../application/commands/update-${feature}.command";
import { Delete${Feature}Command } from "../../application/commands/delete-${feature}.command";
import { Get${Feature}ByIdQuery } from "../../application/queries/get-${feature}-by-id.query";
import { Get${FeaturePlural}Query } from "../../application/queries/get-${featurePlural}.query";
import { to${Feature}Response } from "../mappers/${featurePlural}.mapper";

const ERROR_CONFIG = {
  ${Feature.toUpperCase()}_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    i18nKey: "api.error.notFound",
  },
  EVENT_DISPATCH_FAILED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    i18nKey: "api.error.eventDispatchFailed",
  },
};

@Controller("${featurePlural}")
export class ${FeaturePlural}Controller {
  constructor(
    private readonly createCmd: Create${Feature}Command,
    private readonly updateCmd: Update${Feature}Command,
    private readonly deleteCmd: Delete${Feature}Command,
    private readonly getByIdQuery: Get${Feature}ByIdQuery,
    private readonly listQuery: Get${FeaturePlural}Query,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @RequirePermission("${featurePlural}:read")
  @ResponseSchema(${Feature}ListResponseSchema)
  async list(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery, @Req() req: FastifyRequest): Promise<${Feature}ListResponseDto> {
    const actor = requireAuthenticatedUser(req);
    const lang = req?.headers["accept-language"];
    const result = await this.listQuery.execute(query, actor);
    const val = handleResult(result, {}, this.i18n, lang);
    return {
      items: val.items.map(to${Feature}Response),
      total: val.total,
      page: val.page,
      limit: val.limit,
      totalPages: val.totalPages,
    };
  }

  @Get(":id")
  @RequirePermission("${featurePlural}:read")
  @ResponseSchema(${Feature}ResponseSchema)
  async getById(@Param("id", new ZodValidationPipe(z.string().min(1))) id: string, @Req() req: FastifyRequest): Promise<${Feature}ResponseDto> {
    const actor = requireAuthenticatedUser(req);
    const lang = req?.headers["accept-language"];
    const result = await this.getByIdQuery.execute(id, actor);
    const entity = handleResult(result, ERROR_CONFIG, this.i18n, lang);
    return to${Feature}Response(entity);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("${featurePlural}:create")
  @ResponseSchema(${Feature}ResponseSchema)
  async create(@Body(new ZodValidationPipe(Create${Feature}Schema)) body: Create${Feature}Dto, @Req() req: FastifyRequest): Promise<${Feature}ResponseDto> {
    const actor = requireAuthenticatedUser(req);
    const lang = req?.headers["accept-language"];
    const result = await this.createCmd.execute(body, actor);
    const entity = handleResult(result, ERROR_CONFIG, this.i18n, lang);
    return to${Feature}Response(entity);
  }

  @Patch(":id")
  @Idempotent()
  @RequirePermission("${featurePlural}:update")
  @ResponseSchema(${Feature}ResponseSchema)
  async update(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Body(new ZodValidationPipe(Update${Feature}Schema)) body: Update${Feature}Dto,
    @Req() req: FastifyRequest,
  ): Promise<${Feature}ResponseDto> {
    const actor = requireAuthenticatedUser(req);
    const lang = req?.headers["accept-language"];
    const result = await this.updateCmd.execute(id, body, actor);
    const entity = handleResult(result, ERROR_CONFIG, this.i18n, lang);
    return to${Feature}Response(entity);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent()
  @RequirePermission("${featurePlural}:delete")
  @ResponseSchema(EmptyResponseSchema)
  async delete(@Param("id", new ZodValidationPipe(z.string().min(1))) id: string, @Req() req: FastifyRequest): Promise<void> {
    const actor = requireAuthenticatedUser(req);
    const lang = req?.headers["accept-language"];
    const result = await this.deleteCmd.execute(id, actor);
    handleResult(result, ERROR_CONFIG, this.i18n, lang);
  }
}
`;

  const moduleContent = `import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../../infrastructure/authorization";
import { OutboxModule } from "../../../infrastructure/outbox/outbox.module";
import { ${FeaturePlural}Controller } from "./presentation/${featurePlural}.controller";
import { ${FeaturePlural}OrpcController } from "./presentation/${featurePlural}.orpc.controller";
import { ${FeaturePlural}Repository } from "./infrastructure/${featurePlural}.repository";
import { Create${Feature}Command } from "./application/commands/create-${feature}.command";
import { Update${Feature}Command } from "./application/commands/update-${feature}.command";
import { Delete${Feature}Command } from "./application/commands/delete-${feature}.command";
import { Get${Feature}ByIdQuery } from "./application/queries/get-${feature}-by-id.query";
import { Get${FeaturePlural}Query } from "./application/queries/get-${featurePlural}.query";
import { ${Feature}RealtimeListener } from "./application/listeners/${feature}-realtime.listener";

@Module({
  imports: [AuthorizationModule, OutboxModule],
  controllers: [${FeaturePlural}Controller, ${FeaturePlural}OrpcController],
  providers: [
    ${FeaturePlural}Controller,
    ${FeaturePlural}Repository,
    Create${Feature}Command,
    Update${Feature}Command,
    Delete${Feature}Command,
    Get${Feature}ByIdQuery,
    Get${FeaturePlural}Query,
    ${Feature}RealtimeListener,
  ],
  exports: [
    Create${Feature}Command,
    Update${Feature}Command,
    Delete${Feature}Command,
    Get${Feature}ByIdQuery,
    Get${FeaturePlural}Query,
  ],
})
export class ${ModuleName}Module {}
`;

  writeFileIfMissing(
    path.join(modulePath, "presentation", "mappers", `${featurePlural}.mapper.ts`),
    mapperContent,
  );
  writeFileIfMissing(
    path.join(modulePath, "presentation", "controllers", `${featurePlural}.controller.ts`),
    controllerContent,
  );
  const orpcControllerContent = `import { Controller, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ${featurePlural}Contract } from "@repo/contracts";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import { invokeOrpc } from "../../../../infrastructure/orpc";
import { Idempotent, RequirePermission } from "../../../common";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { ${FeaturePlural}Controller } from "../controllers/${featurePlural}.controller";

@Controller("rpc")
export class ${FeaturePlural}OrpcController {
  constructor(
    private readonly controller: ${FeaturePlural}Controller,
    private readonly i18n: I18nService,
  ) {}

  @Implement(${featurePlural}Contract.list)
  @RequirePermission("${featurePlural}:read")
  list(@Req() request: FastifyRequest) {
    return implement(${featurePlural}Contract.list).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.list(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(${featurePlural}Contract.getById)
  @RequirePermission("${featurePlural}:read")
  getById(@Req() request: FastifyRequest) {
    return implement(${featurePlural}Contract.getById).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.getById(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(${featurePlural}Contract.create)
  @Idempotent()
  @RequirePermission("${featurePlural}:create")
  create(@Req() request: FastifyRequest) {
    return implement(${featurePlural}Contract.create).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.create(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(${featurePlural}Contract.update)
  @Idempotent()
  @RequirePermission("${featurePlural}:update")
  update(@Req() request: FastifyRequest) {
    return implement(${featurePlural}Contract.update).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.update(input.id, input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(${featurePlural}Contract.delete)
  @Idempotent()
  @RequirePermission("${featurePlural}:delete")
  delete(@Req() request: FastifyRequest) {
    return implement(${featurePlural}Contract.delete).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.delete(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
`;
  writeFileIfMissing(
    path.join(modulePath, "presentation", "orpc", `${featurePlural}.orpc.controller.ts`),
    orpcControllerContent,
  );
  const parityTestContent = `import { ${featurePlural}Contract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import { describeRouteParity, routePairs, type RoutePair } from "../../../../common/testing/route-parity";
import { ${FeaturePlural}Controller } from "./${featurePlural}.controller";
import { ${FeaturePlural}OrpcController } from "../orpc/${featurePlural}.orpc.controller";

const routes: RoutePair[] = routePairs(${featurePlural}Contract, ${FeaturePlural}OrpcController, ${FeaturePlural}Controller, [
  ["list", "list", "list"],
  ["getById", "getById", "getById"],
  ["create", "create", "create"],
  ["update", "update", "update"],
  ["delete", "delete", "delete"],
]);

describeRouteParity({
  domain: "${featurePlural}",
  routes,
  controllers: [[${FeaturePlural}Controller, "${FeaturePlural}Controller"]],
  contract: ${featurePlural}Contract as unknown as Record<string, AnyContractProcedure>,
});
`;
  writeFileIfMissing(
    path.join(modulePath, "presentation", "controllers", `${featurePlural}.parity.test.ts`),
    parityTestContent,
  );
  writeOrUpdateModule(path.join(modulePath, `${moduleName}.module.ts`), moduleContent, {
    imports: [
      `import { AuthorizationModule } from "../../../infrastructure/authorization";`,
      `import { OutboxModule } from "../../../infrastructure/outbox/outbox.module";`,
      `import { ${FeaturePlural}Controller } from "./presentation/controllers/${featurePlural}.controller";`,
      `import { ${FeaturePlural}OrpcController } from "./presentation/orpc/${featurePlural}.orpc.controller";`,
      `import { ${FeaturePlural}Repository } from "./infrastructure/repositories/${featurePlural}.repository";`,
      `import { Create${Feature}Command } from "./application/commands/create-${feature}.command";`,
      `import { Update${Feature}Command } from "./application/commands/update-${feature}.command";`,
      `import { Delete${Feature}Command } from "./application/commands/delete-${feature}.command";`,
      `import { Get${Feature}ByIdQuery } from "./application/queries/get-${feature}-by-id.query";`,
      `import { Get${FeaturePlural}Query } from "./application/queries/get-${featurePlural}.query";`,
      `import { ${Feature}RealtimeListener } from "./application/listeners/${feature}-realtime.listener";`,
    ],
    controllers: [`${FeaturePlural}Controller`, `${FeaturePlural}OrpcController`],
    providers: [
      `${FeaturePlural}Controller`,
      `${FeaturePlural}Repository`,
      `Create${Feature}Command`,
      `Update${Feature}Command`,
      `Delete${Feature}Command`,
      `Get${Feature}ByIdQuery`,
      `Get${FeaturePlural}Query`,
      `${Feature}RealtimeListener`,
    ],
    exports: [
      `Create${Feature}Command`,
      `Update${Feature}Command`,
      `Delete${Feature}Command`,
      `Get${Feature}ByIdQuery`,
      `Get${FeaturePlural}Query`,
    ],
  });
}

function writeOrUpdateModule(filePath, content, additions) {
  if (!fs.existsSync(filePath)) {
    writeFileIfMissingOrScaffold(filePath, content, "GENERATED_MODULE_SCAFFOLD");
    return;
  }
  const existing = fs.readFileSync(filePath, "utf8");
  if (existing.includes("GENERATED_MODULE_SCAFFOLD")) {
    writeFileIfMissingOrScaffold(filePath, content, "GENERATED_MODULE_SCAFFOLD");
    return;
  }

  let updated = existing;
  for (const line of additions.imports) {
    if (!updated.includes(line)) updated = updated.replace("@Module({", `${line}\n\n@Module({`);
  }
  updated = addModuleEntries(updated, "controllers", additions.controllers);
  updated = addModuleEntries(updated, "providers", additions.providers);
  updated = addModuleEntries(updated, "exports", additions.exports);
  if (updated !== existing) {
    fs.writeFileSync(filePath, updated, "utf8");
    console.log(
      `  [update] Added ${additions.controllers[0]} feature wiring to ${path.relative(process.cwd(), filePath)}`,
    );
  }
}

function addModuleEntries(source, property, entries) {
  const pattern = new RegExp(`(${property}: \\[)([\\s\\S]*?)(\\])`);
  const match = source.match(pattern);
  if (!match) return source;
  const missing = entries.filter((entry) => !match[2].includes(entry));
  if (missing.length === 0) return source;
  const additions = missing.map((entry) => `    ${entry},`).join("\n");
  const current = match[2].trim();
  return source.replace(pattern, `$1\n${current}${current ? "\n" : ""}${additions}\n$3`);
}

module.exports = { generatePresentation };
