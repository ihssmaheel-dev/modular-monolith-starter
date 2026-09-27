const path = require("path");
const { writeFileIfMissing } = require("./utils");

function generateDomain({ modulePath, feature, Feature, featurePlural, FeaturePlural }) {
  const entityContent = `export class ${Feature} {
  private constructor(
    public readonly id: string,
    public name: string,
    public description: string | undefined,
    public readonly createdBy: string | undefined,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly tenantId?: string,
  ) {}

  static fromPersistence(data: {
    id: string;
    name: string;
    description?: string;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId?: string;
  }): ${Feature} {
    return new ${Feature}(
      data.id,
      data.name,
      data.description,
      data.createdBy,
      data.createdAt,
      data.updatedAt,
      data.tenantId,
    );
  }

  update(data: { name?: string; description?: string }): void {
    if (data.name !== undefined) this.name = data.name;
    if (data.description !== undefined) this.description = data.description;
  }
}
`;

  const entityTestContent = `import { describe, expect, it } from "vitest";
import { ${Feature} } from "./${feature}.entity";

describe("${Feature} Entity", () => {
  it("creates an instance from persistence data", () => {
    const now = new Date();
    const entity = ${Feature}.fromPersistence({
      id: "test-id",
      name: "Test Name",
      description: "Test Desc",
      createdBy: "user-1",
      createdAt: now,
      updatedAt: now,
      tenantId: "tenant-1",
    });

    expect(entity.id).toBe("test-id");
    expect(entity.name).toBe("Test Name");
    expect(entity.tenantId).toBe("tenant-1");
  });

  it("updates fields correctly", () => {
    const now = new Date();
    const entity = ${Feature}.fromPersistence({
      id: "test-id",
      name: "Old Name",
      createdAt: now,
      updatedAt: now,
    });

    entity.update({ name: "New Name", description: "Updated" });
    expect(entity.name).toBe("New Name");
    expect(entity.description).toBe("Updated");
  });
});
`;

  const eventContent = `export class ${Feature}CreatedEvent {
  constructor(
    public readonly id: string,
    public readonly actorId: string,
    public readonly name: string,
    public readonly tenantId?: string,
  ) {}
}

export class ${Feature}UpdatedEvent {
  constructor(
    public readonly id: string,
    public readonly actorId: string,
    public readonly name: string,
    public readonly tenantId?: string,
  ) {}
}

export class ${Feature}DeletedEvent {
  constructor(
    public readonly id: string,
    public readonly actorId: string,
    public readonly tenantId?: string,
  ) {}
}
`;

  const errorContent = `import { BaseDomainError } from "../../../../common";

export class ${Feature}NotFoundError extends BaseDomainError {
  readonly type = "${Feature.toUpperCase()}_NOT_FOUND";
  constructor(public readonly id: string) {
    super(\`${Feature} not found: \${id}\`);
  }
}
`;

  writeFileIfMissing(
    path.join(modulePath, "domain", "entities", `${feature}.entity.ts`),
    entityContent,
  );
  writeFileIfMissing(
    path.join(modulePath, "domain", "entities", `${feature}.entity.test.ts`),
    entityTestContent,
  );
  writeFileIfMissing(
    path.join(modulePath, "domain", "events", `${feature}.events.ts`),
    eventContent,
  );
  writeFileIfMissing(
    path.join(modulePath, "domain", "errors", `${feature}.errors.ts`),
    errorContent,
  );
}

module.exports = { generateDomain };
