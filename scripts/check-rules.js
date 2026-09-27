const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const failures = [];

const isChangedMode = process.argv.includes("--changed");
const isStagedMode = process.argv.includes("--staged");

function getChangedFiles(stagedOnly = false) {
  try {
    const diffCmd = stagedOnly ? "git diff --name-only --cached" : "git diff --name-only HEAD";
    const untrackedCmd = "git ls-files --others --exclude-standard";
    const diffOutput = execSync(diffCmd, { encoding: "utf8", cwd: ROOT });
    const untrackedOutput = stagedOnly
      ? ""
      : execSync(untrackedCmd, { encoding: "utf8", cwd: ROOT });
    const files = new Set(
      `${diffOutput}\n${untrackedOutput}`
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => path.resolve(ROOT, f)),
    );
    return [...files].filter((f) => fs.existsSync(f));
  } catch {
    return [];
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        [
          "dist",
          "node_modules",
          ".turbo",
          ".vite",
          "storybook-static",
          "coverage",
          ".venv",
          "venv",
          ".git",
          ".output",
          ".tanstack",
        ].includes(entry.name)
      )
        return [];
      return walk(target);
    }
    return [target];
  });
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function report(file, message) {
  failures.push(`${relative(file)}: ${message}`);
}

function isTest(file) {
  return /\.(test|spec)\.[jt]sx?$/.test(file);
}

// Limits mirror ai_instructions/CODE_QUALITY_RULES.md (the single source).
// Stricter per-area caps below the 400 default are intentional.
function getLineLimit(name, isTestFile) {
  if (isTestFile) return 800;
  if (name.startsWith("packages/email/")) return 400;
  if (name.startsWith("packages/ui/src/components/composed/")) return 400;
  if (name.startsWith("packages/ui/src/components/ui/")) return 800;
  if (name.startsWith("packages/ui/src/components/")) return 400;
  if (name.startsWith("packages/ui/")) return 400;
  if (name.startsWith("packages/design-tokens/")) return 400;
  if (name.startsWith("packages/authorization/")) return 400;
  if (name.startsWith("apps/mobile/src/components/ui/")) return 400;
  if (name.startsWith("apps/mobile/src/theme/")) return 400;
  if (name.startsWith("apps/mobile/src/stores/")) return 200;
  if (name.startsWith("apps/mobile/")) return 250;
  if (name.startsWith("apps/web/src/routes/")) return 150;
  if (name.startsWith("apps/web/src/features/")) return 400;
  if (name.startsWith("apps/web/src/components/")) return 400;
  if (name.startsWith("apps/web/src/lib/")) return 250;
  if (name.startsWith("apps/web/src/stores/")) return 200;
  return 400;
}

function checkFile(file) {
  const name = relative(file);
  const fileName = path.basename(file);
  const source = fs.readFileSync(file, "utf8");
  const lineCount = source.trimEnd().split(/\r?\n/).length;
  const limit = getLineLimit(name, isTest(file));
  if (!name.endsWith("routeTree.gen.ts") && lineCount > limit) {
    report(file, `${lineCount} lines exceeds the ${limit}-line limit`);
  }
  if (name.endsWith("routeTree.gen.ts")) return;
  if (name.endsWith(".d.ts")) return;
  if (fileName.includes("mongoose") || fileName.includes("mongo")) {
    report(
      file,
      "Mongo/Mongoose files are forbidden — use Drizzle schemas (infrastructure/schemas/*.schema.ts)",
    );
  }

  const isDesignTokensScript = name.startsWith("packages/design-tokens/scripts/");
  const forbidden = [
    [/\bas\s+any\b|:\s*any\b|<any>|\bany\[\]/, "explicit any is forbidden"],
    [/@ts-ignore|@ts-nocheck/, "TypeScript suppression is forbidden"],
    [/_unsafeUnwrap/, "unsafe Result unwrapping is forbidden"],
    [/console\.(log|warn|error|info|debug)\s*\(/, "console methods are forbidden"],
  ];
  // Mobile palette bans — enforce semantic tokens
  const isMobileUi = name.startsWith("apps/mobile/");
  const isGenerated =
    name.includes("tokens.generated") || name.includes("tailwind.tokens.generated");
  if (isMobileUi && !isGenerated && !isTest(file)) {
    if (/bg-slate-|text-slate-|border-slate-|from-slate-|to-slate-/.test(source)) {
      report(
        file,
        "hardcoded slate palette forbidden in mobile — use semantic bg-background/text-foreground/border-border",
      );
    }
    if (/bg-white(?![\w-])/.test(source) && !name.includes("auth-screen")) {
      // auth-screen uses bg-white via semantic bg-card, but raw bg-white is banned
      if (/\bbg-white\b/.test(source))
        report(file, "raw bg-white forbidden in mobile — use bg-card/bg-background");
    }
    if (/\btext-red-600\b|\bborder-red-200\b|\bbg-red-/.test(source)) {
      report(file, "raw red palette forbidden in mobile — use text-destructive/border-destructive");
    }
    if (/from\s+["']@repo\/ui/.test(source)) {
      report(file, "mobile must not import @repo/ui — use apps/mobile/src/components/ui/*");
    }
  }
  for (const [pattern, message] of forbidden) {
    if (isDesignTokensScript) continue;
    if (pattern.test(source)) report(file, message);
  }
  if (isTest(file)) return;
  if (/\/(application|domain)\//.test(`/${name}`) && /\bthrow\b/.test(source)) {
    report(file, "application/domain code must return Result instead of throwing");
  }
  if (
    name.includes("/infrastructure/schemas/") &&
    name.endsWith(".schema.ts") &&
    source.includes("pgTable")
  ) {
    if (/\b(index|unique)\s*:\s*true|Schema\.index\s*\(/.test(source)) {
      report(file, "database indexes must be declared only in migrations");
    }
  }
  if (!name.includes("/infrastructure/database/") && /from\s+["'][^"']*database\//.test(source)) {
    report(file, "database consumers must import from the public database barrel");
  }
}

function leafKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "object" && child !== null) return leafKeys(child, next);
    return [next];
  });
}

function checkLocaleParity() {
  const localeDirectory = path.join(ROOT, "packages/i18n/src/locales");
  if (!fs.existsSync(localeDirectory)) return;
  const locales = ["en", "es", "fr"].map((locale) => {
    const file = path.join(localeDirectory, `${locale}.json`);
    return { locale, file, keys: new Set(leafKeys(JSON.parse(fs.readFileSync(file, "utf8")))) };
  });
  const expected = locales[0].keys;
  for (const current of locales.slice(1)) {
    const missing = [...expected].filter((key) => !current.keys.has(key));
    const extra = [...current.keys].filter((key) => !expected.has(key));
    if (missing.length) report(current.file, `missing locale keys: ${missing.join(", ")}`);
    if (extra.length) report(current.file, `unexpected locale keys: ${extra.join(", ")}`);
  }
}

function checkTranslationUsage(filesToCheck) {
  const englishFile = path.join(ROOT, "packages/i18n/src/locales/en.json");
  if (!fs.existsSync(englishFile)) return;
  const englishKeys = new Set(leafKeys(JSON.parse(fs.readFileSync(englishFile, "utf8"))));
  const patterns = [
    { pattern: /\b(?:t|translate)\(\s*["'`]([^"'`]+)["'`]/g, keyPattern: null },
    {
      pattern: /\bthrow\s+new\s+Error\(\s*["'`]([^"'`]+)["'`]/g,
      keyPattern: /^[A-Za-z0-9_.{}-]+$/,
    },
    {
      pattern: /\btitleKey:\s*["'`]([^"'`]+)["'`]/g,
      keyPattern: null,
    },
  ];

  const allowedDynamicTranslations = [
    /^(?:CATEGORY|CHANNEL|CADENCE|STATUS)_LABELS\[/,
    /^mutation\.error\.message$/,
    /^(?:item|section|action)\.(?:titleKey|errorKey)/,
    /^toErrorKey\(/,
  ];

  const targetFiles = filesToCheck
    ? filesToCheck.filter((f) => CODE_EXTENSIONS.has(path.extname(f)) && !isTest(f))
    : ["apps", "packages"].flatMap((dir) =>
        fs.existsSync(path.join(ROOT, dir))
          ? walk(path.join(ROOT, dir)).filter(
              (f) => CODE_EXTENSIONS.has(path.extname(f)) && !isTest(f),
            )
          : [],
      );

  for (const file of targetFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const { pattern: translationPattern, keyPattern } of patterns) {
      for (const match of source.matchAll(translationPattern)) {
        const key = match[1];
        if (!key) continue;
        if (keyPattern && !keyPattern.test(key)) continue;
        if (!englishKeys.has(key)) report(file, `unknown translation key: ${key}`);
      }
    }
    const rel = relative(file);
    if (rel.startsWith("apps/web/") || rel.startsWith("apps/mobile/")) {
      const dynamicPattern = /\bt\(\s*([^)"'`,\s][^),]*)/g;
      for (const match of source.matchAll(dynamicPattern)) {
        const expr = match[1].trim();
        if (!allowedDynamicTranslations.some((pattern) => pattern.test(expr))) {
          report(
            file,
            `unvalidated dynamic translation call: t(${expr}) — use string literals or allowlisted lookup maps`,
          );
        }
      }
    }
  }
}

function checkTenantRepositories(filesToCheck) {
  const modulesDirectory = path.join(ROOT, "apps/api/src/modules");
  if (!fs.existsSync(modulesDirectory)) return;

  if (filesToCheck) {
    const repoFiles = filesToCheck.filter(
      (f) =>
        f.endsWith(".repository.ts") &&
        relative(f).startsWith("apps/api/src/modules/") &&
        !relative(f).startsWith("apps/api/src/modules/tenancy/") &&
        !relative(f).startsWith("apps/api/src/modules/privacy/"),
    );
    for (const file of repoFiles) {
      const source = fs.readFileSync(file, "utf8");
      const isTenantScoped =
        /extends\s+TenantScopedRepository/.test(source) ||
        (/extends\s+(DrizzleBaseRepository|BaseRepository)/.test(source) &&
          /super\([^)]*,\s*true/.test(source));
      const isSubjectScoped = source.includes("subject-scoped:");
      if (!isTenantScoped && !isSubjectScoped) {
        report(
          file,
          "tenant-owned repositories must extend TenantScopedRepository or BaseRepository with tenantScoped=true (or document subject-scoped: isolation)",
        );
      }
    }
    return;
  }

  for (const entry of fs.readdirSync(modulesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ["tenancy", "privacy"].includes(entry.name)) {
      continue;
    }
    const infrastructure = path.join(modulesDirectory, entry.name, "infrastructure");
    if (!fs.existsSync(infrastructure)) continue;
    const files = walk(infrastructure);
    const schemas = files.filter((file) => file.endsWith(".schema.ts"));
    const isTenantOwned = schemas.some((file) =>
      fs.readFileSync(file, "utf8").includes("tenantId"),
    );
    if (!isTenantOwned) continue;
    for (const file of files.filter((value) => value.endsWith(".repository.ts"))) {
      const source = fs.readFileSync(file, "utf8");
      const isTenantScoped =
        /extends\s+TenantScopedRepository/.test(source) ||
        (/extends\s+(DrizzleBaseRepository|BaseRepository)/.test(source) &&
          /super\([^)]*,\s*true/.test(source));
      const isSubjectScoped = source.includes("subject-scoped:");
      if (!isTenantScoped && !isSubjectScoped) {
        report(
          file,
          "tenant-owned repositories must extend TenantScopedRepository or BaseRepository with tenantScoped=true (or document subject-scoped: isolation)",
        );
      }
    }
  }
}

function checkDocumentationDrift() {
  const docTargets = [
    path.join(ROOT, "AGENTS.md"),
    path.join(ROOT, ".cursorrules"),
    ...(fs.existsSync(path.join(ROOT, "ai_instructions"))
      ? walk(path.join(ROOT, "ai_instructions"))
      : []),
    ...(fs.existsSync(path.join(ROOT, "docs")) ? walk(path.join(ROOT, "docs")) : []),
  ].filter(
    (file) => fs.existsSync(file) && (file.endsWith(".md") || file.endsWith(".cursorrules")),
  );

  const bannedPatterns = [
    [/\bmongoose\b/i, "obsolete 'Mongoose' reference — use Drizzle/Postgres"],
    [/\bmongodb\b/i, "obsolete 'MongoDB' reference — use PostgreSQL"],
    [
      /\bpackages\/shared\b/i,
      "obsolete 'packages/shared' reference — use @repo/contracts, @repo/i18n, etc.",
    ],
    [/\b@ts-rest\b/i, "obsolete '@ts-rest' reference — use oRPC/NestJS"],
  ];

  for (const file of docTargets) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const [pattern, message] of bannedPatterns) {
        if (pattern.test(line)) {
          report(file, `line ${index + 1}: ${message}`);
        }
      }
    });
  }
}

function checkGeneratedTokensFresh() {
  const generated = [
    "packages/ui/src/styles/tokens.generated.css",
    "packages/email/src/styles/tokens.ts",
    "apps/mobile/src/theme/tokens.generated.ts",
    "apps/mobile/src/theme/tailwind.tokens.generated.js",
  ];
  for (const rel of generated) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) report(file, `missing generated file — run pnpm theme:generate`);
    else if (fs.readFileSync(file, "utf8").indexOf("GENERATED") === -1) {
      report(file, "generated file missing header — run pnpm theme:generate");
    }
  }
}

function checkRoutePermissions(filesToCheck) {
  const routePattern = /@(Get|Post|Put|Patch|Delete|Implement)\(/;
  const targets = filesToCheck
    ? filesToCheck.filter(
        (f) => relative(f).startsWith("apps/api/src") && f.endsWith(".controller.ts") && !isTest(f),
      )
    : fs.existsSync(path.join(ROOT, "apps/api/src"))
      ? walk(path.join(ROOT, "apps/api/src")).filter(
          (f) => f.endsWith(".controller.ts") && !isTest(f),
        )
      : [];

  for (const file of targets) {
    const source = fs.readFileSync(file, "utf8");
    if (!routePattern.test(source)) continue;
    if (source.includes("@RequirePermission") || source.includes("@Public")) continue;
    if (source.includes("allow-authenticated-only-routes")) continue;
    report(
      file,
      "controllers with routes must declare @RequirePermission (or @Public for open routes)",
    );
  }
}

function checkWebTestCoverage(filesToCheck) {
  if (filesToCheck) {
    const targets = filesToCheck.filter(
      (f) =>
        !isTest(f) &&
        (relative(f).startsWith("apps/web/src/features") ||
          relative(f).startsWith("apps/mobile/src/features")) &&
        /([^/]+)\.(queries|mutations)\.tsx?$/.test(relative(f)),
    );
    for (const file of targets) {
      const match = /([^/]+)\.(queries|mutations)\.tsx?$/.exec(relative(file));
      if (!match) continue;
      const [, base, kind] = match;
      const siblings = new Set(fs.readdirSync(path.dirname(file)));
      if (!siblings.has(`${base}.${kind}.test.ts`) && !siblings.has(`${base}.${kind}.test.tsx`)) {
        report(
          file,
          `feature ${kind} module must have a co-located test file (${base}.${kind}.test.ts[x])`,
        );
      }
    }
    return;
  }

  for (const app of ["apps/web", "apps/mobile"]) {
    const featuresDirectory = path.join(ROOT, `${app}/src/features`);
    if (!fs.existsSync(featuresDirectory)) continue;
    for (const file of walk(featuresDirectory)) {
      if (isTest(file)) continue;
      const match = /([^/]+)\.(queries|mutations)\.tsx?$/.exec(relative(file));
      if (!match) continue;
      const [, base, kind] = match;
      const siblings = new Set(fs.readdirSync(path.dirname(file)));
      if (!siblings.has(`${base}.${kind}.test.ts`) && !siblings.has(`${base}.${kind}.test.tsx`)) {
        report(
          file,
          `feature ${kind} module must have a co-located test file (${base}.${kind}.test.ts[x])`,
        );
      }
    }
  }
}

function checkWebFetchUsage(filesToCheck) {
  const fetchAllowlist = new Set([
    "apps/web/src/lib/api.ts",
    "apps/mobile/src/lib/api.ts",
    "apps/mobile/src/features/files/files.mutations.ts",
  ]);
  const targets = filesToCheck
    ? filesToCheck.filter(
        (f) =>
          (relative(f).startsWith("apps/web/src") || relative(f).startsWith("apps/mobile/src")) &&
          CODE_EXTENSIONS.has(path.extname(f)),
      )
    : ["apps/web", "apps/mobile"].flatMap((app) => {
        const srcDirectory = path.join(ROOT, `${app}/src`);
        return fs.existsSync(srcDirectory)
          ? walk(srcDirectory).filter((f) => CODE_EXTENSIONS.has(path.extname(f)))
          : [];
      });

  for (const file of targets) {
    if (fetchAllowlist.has(relative(file))) continue;
    const source = fs.readFileSync(file, "utf8");
    if (/\bfetch\s*\(/.test(source)) {
      report(
        file,
        "frontend code must call getApiClient() instead of fetch() (allowlisted transports only)",
      );
    }
  }
}

function checkUiStories(filesToCheck) {
  const componentsDirectory = path.join(ROOT, "packages/ui/src/components");
  if (!fs.existsSync(componentsDirectory)) return;
  const exempt = new Set(["packages/ui/src/components/ui/direction.tsx"]);

  const targets = filesToCheck
    ? filesToCheck.filter(
        (f) =>
          relative(f).startsWith("packages/ui/src/components") &&
          f.endsWith(".tsx") &&
          !f.endsWith(".stories.tsx") &&
          !isTest(f),
      )
    : walk(componentsDirectory).filter(
        (f) => f.endsWith(".tsx") && !f.endsWith(".stories.tsx") && !isTest(f),
      );

  for (const file of targets) {
    if (exempt.has(relative(file))) continue;
    const directory = path.dirname(file);
    const base = path.basename(file, ".tsx");
    const siblings = new Set(fs.readdirSync(directory));
    if (!siblings.has(`${base}.stories.tsx`)) {
      report(file, `ui component must have a co-located story file (${base}.stories.tsx)`);
    }
  }
}

function checkCrossTabBoundaries(filesToCheck) {
  const channelOwner = "apps/web/src/lib/cross-tab/channel.ts";
  const querySyncOwner = "apps/web/src/lib/cross-tab/query-sync.tsx";
  const targets = filesToCheck
    ? filesToCheck.filter(
        (f) =>
          relative(f).startsWith("apps/web/src") &&
          CODE_EXTENSIONS.has(path.extname(f)) &&
          !isTest(f),
      )
    : fs.existsSync(path.join(ROOT, "apps/web/src"))
      ? walk(path.join(ROOT, "apps/web/src")).filter(
          (f) => CODE_EXTENSIONS.has(path.extname(f)) && !isTest(f),
        )
      : [];

  for (const file of targets) {
    const name = relative(file);
    if (name === channelOwner || name === querySyncOwner) continue;
    const source = fs.readFileSync(file, "utf8");
    if (/\bnew\s+BroadcastChannel\s*\(/.test(source)) {
      report(file, "BroadcastChannel must only be constructed in lib/cross-tab/channel.ts");
    }
    if (
      /from\s+["']@tanstack\/query-broadcast-client-experimental["']/.test(source) &&
      name !== querySyncOwner
    ) {
      report(file, "the query broadcast client must only be wired in lib/cross-tab/query-sync.tsx");
    }
  }
}

function checkAdrIndex() {
  const adrDirectory = path.join(ROOT, "docs/adr");
  const indexFile = path.join(adrDirectory, "README.md");
  if (!fs.existsSync(adrDirectory) || !fs.existsSync(indexFile)) return;
  const index = fs.readFileSync(indexFile, "utf8");
  for (const file of walk(adrDirectory)) {
    if (!/^\d{4}-.+\.md$/.test(path.basename(file)) || path.basename(file) === "0000-template.md") {
      continue;
    }
    const number = path.basename(file).slice(0, 4);
    if (!index.includes(`| ${number} `)) {
      report(file, `ADR ${number} must be listed in the docs/adr/README.md index table`);
    }
  }
}

function checkAlertRunbookMapping() {
  const alertsFile = path.join(ROOT, "docker/observability/prometheus/alerts.yml");
  const runbooksDirectory = path.join(ROOT, "docs/runbooks");
  if (!fs.existsSync(alertsFile) || !fs.existsSync(runbooksDirectory)) return;
  const alertsSource = fs.readFileSync(alertsFile, "utf8");
  const alertNames = [...alertsSource.matchAll(/-\s*alert:\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const runbookSources = walk(runbooksDirectory)
    .filter((file) => file.endsWith(".md"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const alert of alertNames) {
    if (!runbookSources.includes(alert)) {
      report(alertsFile, `alert ${alert} has no runbook referencing it in docs/runbooks/`);
    }
  }
}

function checkRoutePurity(filesToCheck) {
  const allowlist = new Set([
    "apps/web/src/routes/_app.tsx",
    "apps/web/src/routes/_app.test.ts",
    "apps/web/src/routes/__root.tsx",
  ]);
  const targets = filesToCheck
    ? filesToCheck.filter(
        (f) =>
          relative(f).startsWith("apps/web/src/routes") && CODE_EXTENSIONS.has(path.extname(f)),
      )
    : fs.existsSync(path.join(ROOT, "apps/web/src/routes"))
      ? walk(path.join(ROOT, "apps/web/src/routes")).filter((f) =>
          CODE_EXTENSIONS.has(path.extname(f)),
        )
      : [];

  for (const file of targets) {
    const rel = relative(file);
    if (allowlist.has(rel)) continue;
    const source = fs.readFileSync(file, "utf8");
    if (/\bgetApiClient\s*\(/.test(source)) {
      report(file, "routes must not call getApiClient() — delegate to feature queries/mutations");
    }
    if (/\buseMutation\s*\(/.test(source)) {
      report(file, "routes must not call useMutation() — delegate to feature components");
    }
  }
}

function checkTransportGuards(filesToCheck) {
  const xhrAllowlist = new Set(["apps/web/src/features/files/files.mutations.ts"]);
  const sseAllowlist = new Set(["apps/web/src/hooks/use-realtime-notifications.ts"]);
  const targets = filesToCheck
    ? filesToCheck.filter(
        (f) =>
          (relative(f).startsWith("apps/web/src") || relative(f).startsWith("apps/mobile/src")) &&
          CODE_EXTENSIONS.has(path.extname(f)) &&
          !isTest(f),
      )
    : ["apps/web", "apps/mobile"].flatMap((app) => {
        const srcDirectory = path.join(ROOT, `${app}/src`);
        return fs.existsSync(srcDirectory)
          ? walk(srcDirectory).filter((f) => CODE_EXTENSIONS.has(path.extname(f)) && !isTest(f))
          : [];
      });

  for (const file of targets) {
    const rel = relative(file);
    const source = fs.readFileSync(file, "utf8");
    if (/\bnew\s+XMLHttpRequest\b/.test(source) && !xhrAllowlist.has(rel)) {
      report(file, "XMLHttpRequest is forbidden outside allowlisted file uploaders");
    }
    if (/\bnew\s+EventSource\b/.test(source) && !sseAllowlist.has(rel)) {
      report(file, "EventSource is forbidden outside allowlisted realtime hooks");
    }
  }
}

function checkEnvUsage(filesToCheck) {
  const envAllowlist = new Set(["apps/web/src/lib/env.ts"]);
  const targets = filesToCheck
    ? filesToCheck.filter(
        (f) =>
          relative(f).startsWith("apps/web/src") &&
          CODE_EXTENSIONS.has(path.extname(f)) &&
          !isTest(f),
      )
    : fs.existsSync(path.join(ROOT, "apps/web/src"))
      ? walk(path.join(ROOT, "apps/web/src")).filter(
          (f) => CODE_EXTENSIONS.has(path.extname(f)) && !isTest(f),
        )
      : [];

  for (const file of targets) {
    const rel = relative(file);
    if (envAllowlist.has(rel)) continue;
    const source = fs.readFileSync(file, "utf8");
    if (/\bimport\.meta\.env\b/.test(source)) {
      report(
        file,
        "import.meta.env is forbidden outside apps/web/src/lib/env.ts — use getWebEnv()",
      );
    }
  }
}

// Fast mode execution (diff-scoped)
if (isChangedMode || isStagedMode) {
  const changedFiles = getChangedFiles(isStagedMode);
  const codeFiles = changedFiles.filter(
    (f) =>
      CODE_EXTENSIONS.has(path.extname(f)) &&
      (relative(f).startsWith("apps/") || relative(f).startsWith("packages/")),
  );

  for (const file of codeFiles) {
    checkFile(file);
  }

  checkTranslationUsage(codeFiles);
  checkTenantRepositories(codeFiles);
  checkRoutePermissions(codeFiles);
  checkWebTestCoverage(codeFiles);
  checkWebFetchUsage(codeFiles);
  checkUiStories(codeFiles);
  checkCrossTabBoundaries(codeFiles);
  checkRoutePurity(codeFiles);
  checkTransportGuards(codeFiles);
  checkEnvUsage(codeFiles);

  if (failures.length) {
    process.stderr.write(
      `[check:fast] Architecture rule violations (${failures.length}):\n${failures.join("\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[check:fast] Checked ${codeFiles.length} modified files (file-scoped rules passed).\n` +
        `[check:fast] NOTE: Global checks (depcruise module boundaries, full 3-locale parity, migration lineage) are deferred to test:release / CI.\n`,
    );
  }
  process.exit();
}

// Full global check (Default for CI and rules:check)
for (const directory of ["apps", "packages"]) {
  if (fs.existsSync(path.join(ROOT, directory))) {
    for (const file of walk(path.join(ROOT, directory))) {
      if (CODE_EXTENSIONS.has(path.extname(file))) checkFile(file);
    }
  }
}

checkLocaleParity();
checkTranslationUsage();
checkTenantRepositories();
checkDocumentationDrift();
checkGeneratedTokensFresh();
checkRoutePermissions();
checkWebTestCoverage();
checkWebFetchUsage();
checkUiStories();
checkCrossTabBoundaries();
checkAdrIndex();
checkAlertRunbookMapping();
checkRoutePurity();
checkTransportGuards();
checkEnvUsage();

if (failures.length) {
  process.stderr.write(
    `Architecture rule violations (${failures.length}):\n${failures.join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write("Architecture rules check passed.\n");
}
