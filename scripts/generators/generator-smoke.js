const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const generatorDefinitions = [
  ["domain", "generateDomain"],
  ["infrastructure", "generateInfrastructure"],
  ["application", "generateApplication"],
  ["contracts", "generateContracts"],
  ["client", "generateClient"],
  ["presentation", "generatePresentation"],
  ["web", "generateWeb"],
  ["mobile", "generateMobile"],
].map(([file, name]) => [file, require(`./${file}.generator`)[name]]);

const repositoryRoot = path.resolve(__dirname, "../..");
const rootPath = fs.mkdtempSync(path.join(repositoryRoot, ".generator-smoke-"));

try {
  const context = createContext(rootPath);
  createFixtures(context);
  for (const [, generate] of generatorDefinitions) generate(context);

  const files = collectTypeScriptFiles(rootPath);
  for (const file of files) {
    const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    assert.equal(result.diagnostics?.length ?? 0, 0, `Invalid generated syntax: ${file}`);
  }
  assertRelativeImportsResolve(files, rootPath, repositoryRoot);

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
  assert.ok(fs.existsSync(path.join(rootPath, "apps/web/src/routes/_app/tasks/index.tsx")));
  assert.ok(fs.existsSync(path.join(rootPath, "apps/web/src/routes/_app/tasks/new.tsx")));
  assert.ok(fs.existsSync(path.join(rootPath, "apps/web/src/routes/_app/tasks/$taskId.tsx")));
  assert.ok(
    fs.existsSync(path.join(rootPath, "apps/web/src/features/tasks/components/task-detail.tsx")),
  );
  console.log(`Generator smoke passed for ${files.length} generated TypeScript files.`);

  // Verify --skip-mobile behavior
  const skipMobileRoot = fs.mkdtempSync(path.join(repositoryRoot, ".generator-smoke-skip-"));
  try {
    const skipContext = createContext(skipMobileRoot);
    createFixtures(skipContext);
    for (const [name, generate] of generatorDefinitions) {
      if (name !== "mobile") generate(skipContext);
    }
    assert.ok(!fs.existsSync(path.join(skipMobileRoot, "apps/mobile/app/tasks.tsx")));
    assert.ok(fs.existsSync(path.join(skipMobileRoot, "apps/web/src/routes/_app/tasks/index.tsx")));
    console.log("Generator --skip-mobile smoke passed.");
  } finally {
    fs.rmSync(skipMobileRoot, { recursive: true, force: true });
  }
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
    accessModel: "owner",
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

function assertRelativeImportsResolve(files, generatedRoot, sourceRoot) {
  const extensions = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const imports = source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g);
    for (const match of imports) {
      const target = path.resolve(path.dirname(file), match[1]);
      const sourceTarget = path.join(sourceRoot, path.relative(generatedRoot, target));
      assert.ok(
        extensions.some(
          (extension) =>
            fs.existsSync(`${target}${extension}`) || fs.existsSync(`${sourceTarget}${extension}`),
        ),
        `Missing relative import ${match[1]} in ${file}`,
      );
    }
  }
}
