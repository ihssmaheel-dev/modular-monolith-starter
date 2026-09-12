const fs = require("node:fs");
const path = require("node:path");

const MODULES_DIRECTORY = path.join(__dirname, "apps/api/src/modules");
const MODULE_PATH = "^apps/api/src/modules";
const modules = fs
  .readdirSync(MODULES_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const crossModuleRules = modules.flatMap((name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const otherModules = `${MODULE_PATH}/(?!${escapedName}/)[^/]+`;
  return [
    {
      name: `no-${name}-to-other-module-infrastructure`,
      comment:
        "Modules communicate through commands, queries, or events, never another module's infrastructure.",
      severity: "error",
      from: { path: `${MODULE_PATH}/${escapedName}/` },
      to: { path: `${otherModules}/infrastructure/` },
    },
    {
      name: `no-${name}-to-other-module-schema`,
      comment: "Database schemas and models are private to their owning module.",
      severity: "error",
      from: { path: `${MODULE_PATH}/${escapedName}/` },
      to: { path: `${otherModules}/infrastructure/schemas/` },
    },
    {
      name: `no-${name}-to-other-module-domain`,
      comment:
        "Domain entities and errors are private to their owning module. Cross-module communication uses @repo/contracts.",
      severity: "error",
      from: { path: `${MODULE_PATH}/${escapedName}/(?!.*\\.(test|spec)\\.ts$)` },
      to: { path: `${otherModules}/domain/` },
    },
    {
      name: `no-${name}-to-other-module-presentation`,
      comment: "Presentation mappers and controllers are private to their owning module.",
      severity: "error",
      from: { path: `${MODULE_PATH}/${escapedName}/` },
      to: { path: `${otherModules}/presentation/` },
    },
  ];
});

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Module and layer dependencies must remain acyclic.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-not-to-outer-layers",
      comment:
        "Domain code must not depend on application, presentation, or infrastructure layers.",
      severity: "error",
      from: { path: `${MODULE_PATH}/[^/]+/domain/` },
      to: {
        path: "^apps/api/src/(?:common|infrastructure|modules/[^/]+/(?:application|infrastructure|presentation))/",
      },
    },
    {
      name: "domain-not-to-frameworks",
      comment: "Domain code must remain independent of NestJS, Drizzle ORM, and runtime adapters.",
      severity: "error",
      from: { path: `${MODULE_PATH}/[^/]+/domain/` },
      to: { path: "^(?:@nestjs/|drizzle-orm|pg$|nestjs-cls$)" },
    },
    {
      name: "presentation-not-to-module-infrastructure",
      comment: "Controllers must call application use cases, never module repositories or schemas.",
      severity: "error",
      from: { path: `${MODULE_PATH}/[^/]+/presentation/` },
      to: { path: `${MODULE_PATH}/[^/]+/infrastructure/` },
    },
    {
      name: "application-not-to-mongoose-schemas",
      comment:
        "Application use cases must access persistence through repositories, never schemas or models.",
      severity: "error",
      from: { path: `${MODULE_PATH}/[^/]+/application/` },
      to: { path: `${MODULE_PATH}/[^/]+/infrastructure/schemas/` },
    },
    ...crossModuleRules,
  ],
  options: {
    tsConfig: { fileName: path.join(__dirname, "apps/api/tsconfig.json") },
    doNotFollow: { path: "node_modules" },
  },
};
