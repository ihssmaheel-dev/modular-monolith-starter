const fs = require("fs");
const path = require("path");
const { toPascalCase, toKebabCase, toPlural, ensureDir } = require("./generators/utils");
const { generateDomain } = require("./generators/domain.generator");
const { generateInfrastructure } = require("./generators/infrastructure.generator");
const { generateApplication } = require("./generators/application.generator");
const { generateContracts } = require("./generators/contracts.generator");
const { generateClient } = require("./generators/client.generator");
const { generatePresentation } = require("./generators/presentation.generator");
const { generateWeb } = require("./generators/web.generator");
const { generateMobile } = require("./generators/mobile.generator");

const rawModule = process.argv[2];
const rawFeature = process.argv[3] || rawModule;
const accessArgument = process.argv.find((value) => value.startsWith("--access="));
const accessModel = accessArgument?.split("=")[1];

if (!rawModule) {
  console.error("Error: Module name is required.");
  console.error("Usage: pnpm generate:feature <module> [feature] --access=tenant-shared|owner");
  console.error("Example: pnpm generate:feature tasks task --access=tenant-shared");
  process.exit(1);
}

if (accessModel !== "tenant-shared" && accessModel !== "owner") {
  console.error("Error: --access=tenant-shared or --access=owner is required.");
  console.error("Choose who may read and mutate a resource before generating the slice.");
  process.exit(1);
}

const moduleName = toKebabCase(rawModule);
const ModuleName = toPascalCase(moduleName);

const feature = toKebabCase(rawFeature);
const Feature = toPascalCase(feature);
const featurePlural = toPlural(feature);
const FeaturePlural = toPascalCase(featurePlural);

console.log("\n=======================================================");
console.log("  Full-Stack Vertical Slice Generator");
console.log(`  Module:  ${moduleName} (${ModuleName}Module)`);
console.log(`  Feature: ${feature} (${Feature} / ${FeaturePlural})`);
console.log("=======================================================\n");

const rootPath = path.resolve(__dirname, "..");
const modulePath = path.join(rootPath, "apps", "api", "src", "modules", moduleName);
const contractsPath = path.join(rootPath, "packages", "contracts");
const clientPath = path.join(rootPath, "packages", "api-client");
const mobilePath = path.join(rootPath, "apps", "mobile");

const context = {
  rootPath,
  modulePath,
  moduleName,
  ModuleName,
  feature,
  Feature,
  featurePlural,
  FeaturePlural,
  accessModel,
  contractsPath,
  clientPath,
  mobilePath,
};

console.log("1. Generating Domain Layer...");
generateDomain(context);

console.log("\n2. Generating Infrastructure Layer...");
generateInfrastructure(context);

console.log("\n3. Generating Application Layer (Commands, Queries, Listeners, Vitest Tests)...");
generateApplication(context);

console.log("\n4. Generating Contracts & Schemas (@repo/contracts)...");
generateContracts(context);

console.log("\n5. Generating API Client SDK (@repo/api-client)...");
generateClient(context);

console.log(
  "\n6. Generating Presentation Layer (oRPC, REST compatibility, Mapper, NestJS Module)...",
);
generatePresentation(context);
registerModuleInAppModule(rootPath, moduleName, ModuleName);

console.log("\n7. Generating Web Layer (TanStack Start route + queries + mutations)...");
generateWeb(context);

console.log("\n8. Generating Mobile Layer (Expo route + queries + mutations)...");
generateMobile(context);

console.log("\n=======================================================");
console.log(`  Successfully generated vertical slice for '${feature}'!`);
console.log("=======================================================");
console.log("\nNext Steps:");
console.log(` 1. Review the generated schema and run 'pnpm db:generate && pnpm db:migrate'.`);
console.log(` 2. Add module-specific permissions and localized copy before exposing the feature.`);
console.log(` 3. Run 'pnpm test:unit' to run the new Vitest unit test suite.`);
console.log(" 4. Run 'pnpm build' to verify end-to-end type safety.");
console.log(
  ` 5. Web route: apps/web/src/routes/${featurePlural}.tsx + features/${featurePlural}/*`,
);
console.log(
  ` 6. Mobile route: apps/mobile/app/${featurePlural}.tsx + src/features/${featurePlural}/*`,
);

function registerModuleInAppModule(root, name, pascalName) {
  const appModulePath = path.join(root, "apps", "api", "src", "app.module.ts");
  if (!fs.existsSync(appModulePath)) return;

  const importLine = `import { ${pascalName}Module } from "./modules/${name}/${name}.module";`;
  const moduleEntry = `    ${pascalName}Module,`;
  let source = fs.readFileSync(appModulePath, "utf8");
  if (!source.includes(importLine)) {
    const anchor = 'import { TenancyModule } from "./modules/tenancy/tenancy.module";';
    source = source.includes(anchor)
      ? source.replace(anchor, `${importLine}\n${anchor}`)
      : source.replace("@Module({", `${importLine}\n\n@Module({`);
  }
  if (!source.includes(moduleEntry)) {
    const anchor = "    FilesModule,\n  ],";
    source = source.includes(anchor)
      ? source.replace(anchor, `    FilesModule,\n${moduleEntry}\n  ],`)
      : source.replace("  providers: [", `${moduleEntry}\n  providers: [`);
  }
  fs.writeFileSync(appModulePath, source, "utf8");
  console.log(`  [update] Registered ${pascalName}Module in apps/api/src/app.module.ts`);
}
