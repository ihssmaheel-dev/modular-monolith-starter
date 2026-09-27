const fs = require("fs");
const path = require("path");
const { toPascalCase, toKebabCase, toPlural, ensureDir } = require("./generators/utils");
const { generateDomain } = require("./generators/domain.generator");
const { generateInfrastructure } = require("./generators/infrastructure.generator");
const { generateApplication } = require("./generators/application.generator");
const { generatePolicies } = require("./generators/policies.generator");
const { generateI18nStubs } = require("./generators/i18n.generator");
const { generateContracts } = require("./generators/contracts.generator");
const { generateClient } = require("./generators/client.generator");
const { generatePresentation } = require("./generators/presentation.generator");
const { generateWeb } = require("./generators/web.generator");
const { generateMobile } = require("./generators/mobile.generator");

const rawModule = process.argv[2];
const rawFeature =
  process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : rawModule;
const accessArgument = process.argv.find((value) => value.startsWith("--access="));
const accessModel = accessArgument?.split("=")[1];
const isMinimal = process.argv.includes("--minimal");
const skipWeb =
  isMinimal || process.argv.includes("--skip-web") || process.argv.includes("--no-web");
const skipMobile =
  isMinimal || process.argv.includes("--skip-mobile") || process.argv.includes("--no-mobile");

if (!rawModule) {
  console.error("Error: Module name is required.");
  console.error(
    "Usage: pnpm generate:feature <module> [feature] --access=tenant-shared|owner [--minimal] [--skip-mobile] [--skip-web]",
  );
  console.error("Example: pnpm generate:feature tasks task --access=tenant-shared --minimal");
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
if (isMinimal)
  console.log("  Mode:    MINIMAL (Backend slice: Contracts + CQRS + Infra + REST/oRPC)");
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

console.log("1. Generating Domain Layer (Entity, Events, Typed Errors)...");
generateDomain(context);

console.log("\n2. Generating Infrastructure Layer...");
generateInfrastructure(context);

console.log("\n3. Generating Application Layer (Commands, Queries, Listeners, Vitest Tests)...");
generateApplication(context);
generatePolicies(context);

console.log("\n4. Generating Contracts & Schemas (@repo/contracts)...");
generateContracts(context);

console.log("\n5. Generating API Client SDK (@repo/api-client)...");
generateClient(context);

console.log(
  "\n6. Generating Presentation Layer (oRPC, REST compatibility, Error Maps, Mapper, NestJS Module)...",
);
generatePresentation(context);
registerModuleInAppModule(rootPath, moduleName, ModuleName);

console.log("\n7. Generating i18n Locales (3-locale sync in @repo/i18n)...");
generateI18nStubs(context);

if (!skipWeb) {
  console.log("\n8. Generating Web Layer (TanStack Start route + queries + mutations)...");
  generateWeb(context);
} else {
  console.log("\n8. Skipping Web Layer (--minimal or --skip-web provided)...");
}

if (!skipMobile) {
  console.log("\n9. Generating Mobile Layer (Expo route + queries + mutations)...");
  generateMobile(context);
} else {
  console.log("\n9. Skipping Mobile Layer (--minimal or --skip-mobile provided)...");
}

console.log("\n=======================================================");
console.log(`  Successfully generated vertical slice for '${feature}'!`);
console.log("=======================================================");
console.log("\nNext Steps:");
console.log(` 1. Review the generated schema and run 'pnpm db:generate && pnpm db:migrate'.`);
console.log(
  ` 2. Configure FGA permissions in application/policies/${feature}.policies.ts (default: deny).`,
);
console.log(` 3. Run 'pnpm check:fast' to verify architectural compliance in <200ms.`);
console.log(
  ` 4. Run 'pnpm --filter api test:unit src/modules/${moduleName}' to verify the test suite.`,
);
if (!skipWeb) {
  console.log(
    ` 5. Web routes: apps/web/src/routes/_app/${featurePlural}/* + features/${featurePlural}/*`,
  );
  console.log(
    ` 6. Navigation: Add ${featurePlural} to apps/web/src/config/navigation.config.ts to expose it in sidebar.`,
  );
}

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
