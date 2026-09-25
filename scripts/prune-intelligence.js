#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const isHelp = args.includes("--help") || args.includes("-h");
const isStatus = args.includes("--status");
const isDisable = args.includes("--disable");
const isDryRun = args.includes("--dry-run");
const isYes = args.includes("--yes");

const INTELLIGENCE_PATHS = [
  "services/intelligence",
  "docker/docker-compose.intelligence.yml",
  ".github/workflows/intelligence.yml",
  "apps/api/src/modules/intelligence",
  "packages/contracts/src/schemas/intelligence.schema.ts",
  "packages/contracts/src/contracts/intelligence.contract.ts",
];

function printHelp() {
  process.stdout.write(`
Prune or Disable Optional Python Intelligence Layer

Usage:
  node scripts/prune-intelligence.js [command] [options]

Commands:
  --status   Inspect current status of the intelligence layer
  --disable  Safely disable intelligence at runtime (sets INTELLIGENCE_ENABLED=false)
  --yes      Permanently delete intelligence files and unwire module
  --dry-run  Preview deletion without modifying any files
  --help     Show this help message
`);
}

function checkStatus() {
  process.stdout.write("\nIntelligence Layer Status:\n");
  process.stdout.write("-------------------------\n");
  for (const relPath of INTELLIGENCE_PATHS) {
    const fullPath = path.join(rootDir, relPath);
    const exists = fs.existsSync(fullPath);
    process.stdout.write(`  [${exists ? "PRESENT" : "ABSENT "}] ${relPath}\n`);
  }
}

function disableIntelligence() {
  const envPath = path.join(rootDir, "apps/api/.env");
  if (!fs.existsSync(envPath)) {
    process.stdout.write("apps/api/.env does not exist. No changes made.\n");
    return;
  }
  if (isDryRun) {
    process.stdout.write("  [Dry Run] Would update apps/api/.env -> INTELLIGENCE_ENABLED=false\n");
    return;
  }
  let content = fs.readFileSync(envPath, "utf8");
  if (content.includes("INTELLIGENCE_ENABLED=")) {
    content = content.replace(/INTELLIGENCE_ENABLED=.*/g, "INTELLIGENCE_ENABLED=false");
  } else {
    content += "\nINTELLIGENCE_ENABLED=false\n";
  }
  fs.writeFileSync(envPath, content, "utf8");
  process.stdout.write("Updated apps/api/.env -> INTELLIGENCE_ENABLED=false\n");
}

function unwireFile(relPath, replacer, description) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return;
  const original = fs.readFileSync(fullPath, "utf8");
  const updated = replacer(original);
  if (updated !== original) {
    if (isDryRun) {
      process.stdout.write(`  [Dry Run] Would ${description} in ${relPath}\n`);
    } else {
      fs.writeFileSync(fullPath, updated, "utf8");
      process.stdout.write(`  Updated ${relPath} (${description})\n`);
    }
  }
}

function pruneIntelligence() {
  process.stdout.write("\nPruning Optional Intelligence Layer...\n");

  for (const relPath of INTELLIGENCE_PATHS) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      process.stdout.write(`  Skipping (not found): ${relPath}\n`);
      continue;
    }

    if (isDryRun) {
      process.stdout.write(`  [Dry Run] Would delete: ${relPath}\n`);
    } else {
      fs.rmSync(fullPath, { recursive: true, force: true });
      process.stdout.write(`  Deleted: ${relPath}\n`);
    }
  }

  unwireFile(
    "apps/api/src/app.module.ts",
    (c) =>
      c
        .replace(
          /import\s*\{\s*IntelligenceModule\s*\}\s*from\s*"\.\/modules\/intelligence\/intelligence\.module";\r?\n?/g,
          "",
        )
        .replace(/\s*IntelligenceModule,?\r?\n?/g, "\n"),
    "remove IntelligenceModule",
  );

  unwireFile(
    "packages/contracts/src/schemas/index.ts",
    (c) => c.replace(/export \* from "\.\/intelligence\.schema";\r?\n?/g, ""),
    "remove intelligence.schema export",
  );

  unwireFile(
    "packages/contracts/src/contracts/index.ts",
    (c) => c.replace(/export \* from "\.\/intelligence\.contract";\r?\n?/g, ""),
    "remove intelligence.contract export",
  );

  unwireFile(
    "packages/contracts/src/schemas/env.schema.ts",
    (c) => c.replace(/\s*INTELLIGENCE_[A-Z_]+:[^\n]+\n/g, "\n"),
    "remove INTELLIGENCE_* env keys",
  );

  process.stdout.write("\nDone. The modular monolith is now clean and purely TypeScript.\n");
}

if (isHelp || args.length === 0) {
  printHelp();
  process.exit(0);
}

if (isStatus) {
  checkStatus();
  process.exit(0);
}

if (isDisable) {
  disableIntelligence();
  process.exit(0);
}

if (isYes || isDryRun) {
  pruneIntelligence();
  process.exit(0);
}
