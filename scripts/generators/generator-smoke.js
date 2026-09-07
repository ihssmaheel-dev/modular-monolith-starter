const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const generators = [
  ["domain", "generateDomain"],
  ["infrastructure", "generateInfrastructure"],
  ["application", "generateApplication"],
  ["contracts", "generateContracts"],
  ["client", "generateClient"],
  ["presentation", "generatePresentation"],
  ["web", "generateWeb"],
  ["mobile", "generateMobile"],
].map(([file, name]) => require(`./${file}.generator`)[name]);

const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-generator-"));

try {
  const context = createContext(rootPath);
  createFixtures(context);
  for (const generate of generators) generate(context);

  const files = collectTypeScriptFiles(rootPath);
  for (const file of files) {
    const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    assert.equal(result.diagnostics?.length ?? 0, 0, `Invalid generated syntax: ${file}`);
  }

  const client = fs.readFileSync(path.join(context.clientPath, "src/subclients/tasks.ts"), "utf8");
  const registry = fs.readFileSync(
    path.join(context.contractsPath, "src/contracts/index.ts"),
    "utf8",
  );
  const clientIndex = fs.readFileSync(path.join(context.clientPath, "src/index.ts"), "utf8");
  assert.match(client, /orpc\.tasks\.list/);
  assert.match(registry, /tasks: tasksContract/);
  assert.match(clientIndex, /createTasksClient,/);
  assert.match(clientIndex, /tasks: createTasksClient\(authenticatedFetch, orpcClient\),/);
  console.log(`Generator smoke passed for ${files.length} generated TypeScript files.`);
} finally {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

function createContext(rootPath) {
  return {
    rootPath,
    modulePath: path.join(rootPath, "apps/api/src/modules/tasks"),
    moduleName: "tasks",
    ModuleName: "Tasks",
    feature: "task",
    Feature: "Task",
    featurePlural: "tasks",
    FeaturePlural: "Tasks",
    contractsPath: path.join(rootPath, "packages/contracts"),
    clientPath: path.join(rootPath, "packages/api-client"),
    mobilePath: path.join(rootPath, "apps/mobile"),
  };
}

function createFixtures(context) {
  const files = {
    [path.join(context.contractsPath, "src/schemas/index.ts")]: "",
    [path.join(context.contractsPath, "src/contracts/index.ts")]:
      'import { oc } from "@orpc/contract";\nimport { membershipsContract } from "./memberships.contract";\nexport const apiContract = oc.router({\n  memberships: membershipsContract,\n});\n',
    [path.join(context.clientPath, "src/subclients/index.ts")]: "",
    [path.join(context.clientPath, "src/index.ts")]:
      'import {\n  createUsersClient,\n} from "./subclients";\nconst authenticatedFetch = null;\nconst orpcClient = null;\nexport const api = {\n    users: createUsersClient(authenticatedFetch, orpcClient),\n};\n',
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function collectTypeScriptFiles(rootPath) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(file);
    }
  };
  visit(rootPath);
  return files;
}
