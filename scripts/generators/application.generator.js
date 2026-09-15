const path = require("path");
const { writeFileIfMissing } = require("./utils");

function generateApplication({
  modulePath,
  feature,
  Feature,
  featurePlural,
  FeaturePlural,
  accessModel = "tenant-shared",
}) {
  const ownedFilter = accessModel === "owner" ? ", createdBy: actor.sub" : "";
  const accessComment = `/** Access model: ${accessModel}. Tenant RLS remains the database boundary. */`;
  const createCmd = `import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, type Result } from "neverthrow";
import type { AuthenticatedUser, Create${Feature}Dto } from "@repo/contracts";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import { ${Feature}CreatedEvent } from "../../domain/events/${feature}.events";
import { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
${accessComment}
export class Create${Feature}Command {
  constructor(
    private readonly repository: ${FeaturePlural}Repository,
    private readonly outbox: OutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly database: DatabaseService,
  ) {}

  async execute(dto: Create${Feature}Dto, actor: AuthenticatedUser): Promise<Result<${Feature}, { type: "EVENT_DISPATCH_FAILED" } | { type: "TRANSACTION_FAILED" } | Error>> {
    return this.database.withResultTransaction(async () => {
      const result = await this.repository.create({
        name: dto.name,
        description: dto.description,
        createdBy: actor.sub,
      });
      if (result.isErr()) return result;
      const dispatched = await this.outbox.dispatchTenant(
        "${feature}.created",
        new ${Feature}CreatedEvent(result.value.id, actor.sub, result.value.name, result.value.tenantId),
      );
      if (dispatched.isErr()) return err({ type: "EVENT_DISPATCH_FAILED" });
      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", {
        collectionName: "${featurePlural}",
        documentId: result.value.id,
        action: "CREATE",
        actorId: actor.sub,
        tenantId: result.value.tenantId,
        before: null,
        after: { id: result.value.id, name: result.value.name },
      });
      return result;
    });
  }
}
`;

  const createCmdTest = `import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import { Create${Feature}Command } from "./create-${feature}.command";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import type { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import type { DatabaseService } from "../../../../infrastructure/database";

describe("Create${Feature}Command", () => {
  it("creates a new ${feature} and emits event", async () => {
    const mockEntity = ${Feature}.fromPersistence({
      id: "1",
      name: "Test",
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: "tenant-1",
    });
    const repo = { create: vi.fn().mockResolvedValue(ok(mockEntity)) } as unknown as ${FeaturePlural}Repository;
    const outbox = { dispatchTenant: vi.fn().mockResolvedValue(ok(undefined)) } as unknown as OutboxService;
    const eventEmitter = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const database = { withResultTransaction: vi.fn((fn) => fn()), emitAfterCommit: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseService;
    const cmd = new Create${Feature}Command(repo, outbox, eventEmitter, database);

    const res = await cmd.execute({ name: "Test" }, { sub: "user-1", email: "a@b.com", role: "user" });
    expect(res.isOk()).toBe(true);
    expect(outbox.dispatchTenant).toHaveBeenCalledWith("${feature}.created", expect.any(Object));
  });
});
`;

  const updateCmd = `import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, type Result } from "neverthrow";
import type { AuthenticatedUser, Update${Feature}Dto } from "@repo/contracts";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import { ${Feature}UpdatedEvent } from "../../domain/events/${feature}.events";
import { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
${accessComment}
export class Update${Feature}Command {
  constructor(
    private readonly repository: ${FeaturePlural}Repository,
    private readonly outbox: OutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly database: DatabaseService,
  ) {}

  async execute(
    id: string,
    dto: Update${Feature}Dto,
    actor: AuthenticatedUser,
  ): Promise<Result<${Feature}, { type: "${Feature.toUpperCase()}_NOT_FOUND" } | { type: "CONFLICT" } | { type: "EVENT_DISPATCH_FAILED" } | { type: "TRANSACTION_FAILED" } | Error>> {
    return this.database.withResultTransaction(async () => {
      const existing = await this.repository.findOne({ id${ownedFilter} });
      if (existing.isErr()) return err(existing.error);
      if (!existing.value) return err({ type: "${Feature.toUpperCase()}_NOT_FOUND" });

      const updated = await this.repository.updateById(id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      });
      if (updated.isErr()) return err(updated.error);
      if (!updated.value) return err({ type: "${Feature.toUpperCase()}_NOT_FOUND" });

      const dispatched = await this.outbox.dispatchTenant(
        "${feature}.updated",
        new ${Feature}UpdatedEvent(id, actor.sub, updated.value.name, updated.value.tenantId),
      );
      if (dispatched.isErr()) return err({ type: "EVENT_DISPATCH_FAILED" });
      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", {
        collectionName: "${featurePlural}",
        documentId: updated.value.id,
        action: "UPDATE",
        actorId: actor.sub,
        tenantId: updated.value.tenantId,
        before: { id: existing.value.id, name: existing.value.name },
        after: { id: updated.value.id, name: updated.value.name },
      });
      return updated;
    });
  }
}
`;

  const updateCmdTest = `import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import { Update${Feature}Command } from "./update-${feature}.command";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import type { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import type { DatabaseService } from "../../../../infrastructure/database";

describe("Update${Feature}Command", () => {
  it("updates existing ${feature}", async () => {
    const existing = ${Feature}.fromPersistence({
      id: "1",
      name: "Old",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const updated = ${Feature}.fromPersistence({
      id: "1",
      name: "New",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const repo = {
      findById: vi.fn().mockResolvedValue(ok(existing)),
      updateById: vi.fn().mockResolvedValue(ok(updated)),
    } as unknown as ${FeaturePlural}Repository;
    const outbox = { dispatchTenant: vi.fn().mockResolvedValue(ok(undefined)) } as unknown as OutboxService;
    const eventEmitter = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const database = { withResultTransaction: vi.fn((fn) => fn()), emitAfterCommit: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseService;
    const cmd = new Update${Feature}Command(repo, outbox, eventEmitter, database);

    const res = await cmd.execute("1", { name: "New" }, { sub: "u1", email: "a@b.com", role: "user" });
    expect(res.isOk()).toBe(true);
  });
});
`;

  const deleteCmd = `import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { ${Feature}DeletedEvent } from "../../domain/events/${feature}.events";
import { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
${accessComment}
export class Delete${Feature}Command {
  constructor(
    private readonly repository: ${FeaturePlural}Repository,
    private readonly outbox: OutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly database: DatabaseService,
  ) {}

  async execute(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<Result<void, { type: "${Feature.toUpperCase()}_NOT_FOUND" } | { type: "EVENT_DISPATCH_FAILED" } | { type: "TRANSACTION_FAILED" } | Error>> {
    return this.database.withResultTransaction(async () => {
      const existing = await this.repository.findOne({ id${ownedFilter} });
      if (existing.isErr()) return err(existing.error);
      if (!existing.value) return err({ type: "${Feature.toUpperCase()}_NOT_FOUND" });

      const deleted = await this.repository.softDeleteById(id);
      if (deleted.isErr()) return err(deleted.error);

      const dispatched = await this.outbox.dispatchTenant(
        "${feature}.deleted",
        new ${Feature}DeletedEvent(id, actor.sub, existing.value.tenantId),
      );
      if (dispatched.isErr()) return err({ type: "EVENT_DISPATCH_FAILED" });
      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", {
        collectionName: "${featurePlural}",
        documentId: existing.value.id,
        action: "DELETE",
        actorId: actor.sub,
        tenantId: existing.value.tenantId,
        before: { id: existing.value.id, name: existing.value.name },
        after: null,
      });
      return ok(undefined);
    });
  }
}
`;

  const deleteCmdTest = `import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import { Delete${Feature}Command } from "./delete-${feature}.command";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import type { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import type { DatabaseService } from "../../../../infrastructure/database";

describe("Delete${Feature}Command", () => {
  it("soft deletes existing ${feature}", async () => {
    const existing = ${Feature}.fromPersistence({
      id: "1",
      name: "Old",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const repo = {
      findById: vi.fn().mockResolvedValue(ok(existing)),
      softDeleteById: vi.fn().mockResolvedValue(ok(existing)),
    } as unknown as ${FeaturePlural}Repository;
    const outbox = { dispatchTenant: vi.fn().mockResolvedValue(ok(undefined)) } as unknown as OutboxService;
    const eventEmitter = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const database = { withResultTransaction: vi.fn((fn) => fn()), emitAfterCommit: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseService;
    const cmd = new Delete${Feature}Command(repo, outbox, eventEmitter, database);

    const res = await cmd.execute("1", { sub: "u1", email: "a@b.com", role: "user" });
    expect(res.isOk()).toBe(true);
  });
});
`;

  const getByIdQuery = `import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";

@Injectable()
${accessComment}
export class Get${Feature}ByIdQuery {
  constructor(private readonly repository: ${FeaturePlural}Repository) {}

  async execute(
    id: string,
    ${accessModel === "owner" ? "actor" : "_actor"}: AuthenticatedUser,
  ): Promise<Result<${Feature}, { type: "${Feature.toUpperCase()}_NOT_FOUND" } | Error>> {
    const result = await this.repository.findOne({ id${ownedFilter} });
    if (result.isErr()) return err(result.error);
    if (!result.value) return err({ type: "${Feature.toUpperCase()}_NOT_FOUND" });
    return ok(result.value);
  }
}
`;

  const getByIdQueryTest = `import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { Get${Feature}ByIdQuery } from "./get-${feature}-by-id.query";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import type { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";

describe("Get${Feature}ByIdQuery", () => {
  it("returns entity when found", async () => {
    const existing = ${Feature}.fromPersistence({
      id: "1",
      name: "Found",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const repo = { findById: vi.fn().mockResolvedValue(ok(existing)) } as unknown as ${FeaturePlural}Repository;
    const query = new Get${Feature}ByIdQuery(repo);

    const res = await query.execute("1", { sub: "u1", email: "a@b.com", role: "user" });
    expect(res.isOk()).toBe(true);
  });
});
`;

  const listQuery = `import { Injectable } from "@nestjs/common";
import type { Result } from "neverthrow";
import type { AuthenticatedUser, PaginationQuery } from "@repo/contracts";
import type { PaginatedResult } from "../../../../infrastructure/database";
import { ${Feature} } from "../../domain/entities/${feature}.entity";
import { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";

@Injectable()
${accessComment}
export class Get${FeaturePlural}Query {
  constructor(private readonly repository: ${FeaturePlural}Repository) {}

  async execute(
    pagination: PaginationQuery,
    ${accessModel === "owner" ? "actor" : "_actor"}: AuthenticatedUser,
  ): Promise<Result<PaginatedResult<${Feature}>, Error>> {
    const page = Math.max(1, Number(pagination.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(pagination.limit ?? 20)));
    return this.repository.paginate({${accessModel === "owner" ? " createdBy: actor.sub " : ""}}, { page, limit });
  }
}
`;

  const listQueryTest = `import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { Get${FeaturePlural}Query } from "./get-${featurePlural}.query";
import type { ${FeaturePlural}Repository } from "../../infrastructure/repositories/${featurePlural}.repository";

describe("Get${FeaturePlural}Query", () => {
  it("returns paginated list", async () => {
    const repo = {
      paginate: vi.fn().mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
    } as unknown as ${FeaturePlural}Repository;
    const query = new Get${FeaturePlural}Query(repo);

    const res = await query.execute({ page: 1, limit: 20 }, { sub: "u1", email: "a@b.com", role: "user" });
    expect(res.isOk()).toBe(true);
  });
});
`;

  const listener = `import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { RealtimeService } from "../../../../infrastructure/realtime/realtime.service";
import { ${Feature}CreatedEvent, ${Feature}DeletedEvent, ${Feature}UpdatedEvent } from "../../domain/events/${feature}.events";

@Injectable()
export class ${Feature}RealtimeListener {
  constructor(private readonly realtimeService: RealtimeService) {}

  @OnEvent("${feature}.created")
  handleCreated(event: ${Feature}CreatedEvent): void {
    this.realtimeService.sendToUser(event.actorId, "${feature}.created", event, event.tenantId);
  }

  @OnEvent("${feature}.updated")
  handleUpdated(event: ${Feature}UpdatedEvent): void {
    this.realtimeService.sendToUser(event.actorId, "${feature}.updated", event, event.tenantId);
  }

  @OnEvent("${feature}.deleted")
  handleDeleted(event: ${Feature}DeletedEvent): void {
    this.realtimeService.sendToUser(event.actorId, "${feature}.deleted", event, event.tenantId);
  }
}
`;

  writeFileIfMissing(
    path.join(modulePath, "application", "commands", `create-${feature}.command.ts`),
    createCmd,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "commands", `create-${feature}.command.test.ts`),
    createCmdTest,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "commands", `update-${feature}.command.ts`),
    updateCmd,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "commands", `update-${feature}.command.test.ts`),
    updateCmdTest,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "commands", `delete-${feature}.command.ts`),
    deleteCmd,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "commands", `delete-${feature}.command.test.ts`),
    deleteCmdTest,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "queries", `get-${feature}-by-id.query.ts`),
    getByIdQuery,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "queries", `get-${feature}-by-id.query.test.ts`),
    getByIdQueryTest,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "queries", `get-${featurePlural}.query.ts`),
    listQuery,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "queries", `get-${featurePlural}.query.test.ts`),
    listQueryTest,
  );
  writeFileIfMissing(
    path.join(modulePath, "application", "listeners", `${feature}-realtime.listener.ts`),
    listener,
  );
}

module.exports = { generateApplication };
