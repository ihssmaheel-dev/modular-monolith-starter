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

const ENV_TARGETS = [
  {
    path: path.join(rootDir, "apps/api/.env"),
    variable: "EXAMPLE_FEATURES_ENABLED",
    defaultValue: "false",
  },
  {
    path: path.join(rootDir, "apps/web/.env"),
    variable: "VITE_EXAMPLE_FEATURES_ENABLED",
    defaultValue: "false",
  },
  {
    path: path.join(rootDir, "apps/mobile/.env"),
    variable: "EXPO_PUBLIC_EXAMPLE_FEATURES_ENABLED",
    defaultValue: "false",
  },
];

const EXAMPLE_MODULE_PATHS = [
  "apps/api/src/modules/notes",
  "apps/web/src/routes/_app/notes",
  "apps/web/src/features/notes",
  "apps/mobile/app/(tabs)/notes.tsx",
  "apps/mobile/app/notes",
  "apps/mobile/src/features/notes",
];

const REMOVAL_CHECKLIST = [
  "Remove NotesModule from REFERENCE_FEATURE_MODULES in apps/api/src/app.module.ts.",
  "Remove API, web, and mobile Notes routes, features, tests, navigation, command-menu entries, and dashboard widgets.",
  "Remove the Notes API client subclient and its factory/export wiring.",
  "Remove notes contracts, schemas, routes, permissions, event validators, and public exports from @repo/contracts.",
  "Remove Notes query-key branches, translations, fixtures, generator assumptions, and E2E coverage.",
  "Remove note file-parent lifecycle registration; append a migration before changing file_parent_type in an existing database.",
  "Keep frozen migrations immutable; use an appended migration for table or enum removal.",
  "Run rules, typecheck, unit/integration/E2E, migration lineage, transport parity, and a neutral generated-feature smoke test.",
];

function printHelp() {
  process.stdout.write(`
Prune or Disable Example Features

Usage:
  node scripts/prune-examples.js [command] [options]

Commands:
  --status   Inspect current status of example features across apps
  --disable  Set EXAMPLE_FEATURES_ENABLED=false across all local .env files
  --removal-plan  Print the version-controlled safe-removal checklist

Options:
  --dry-run  Preview actions without modifying files (default unless --yes is passed)
  --yes      Confirm and execute changes
  --help     Show this help message

Notes:
  In this architecture, the Notes module is a reference vertical slice.
  Setting EXAMPLE_FEATURES_ENABLED=false (and its web/mobile counterparts) cleanly
  disables the API module registration, routes, and navigation without losing
  the pattern reference for building production features.
`);
}

function printRemovalPlan() {
  process.stdout.write("\nNotes reference-slice removal checklist:\n\n");
  REMOVAL_CHECKLIST.forEach((item, index) => process.stdout.write(`  ${index + 1}. ${item}\n`));
  process.stdout.write(
    "\nRun this only in a disposable branch/copy and review every diff before commit.\n",
  );
}

function checkStatus() {
  process.stdout.write("\nExample Features Status:\n\n");
  for (const target of ENV_TARGETS) {
    const rel = path.relative(rootDir, target.path);
    if (!fs.existsSync(target.path)) {
      process.stdout.write(`  ${rel}: File not found\n`);
      continue;
    }
    const content = fs.readFileSync(target.path, "utf8");
    const regex = new RegExp(`^${target.variable}=(.*)$`, "m");
    const match = regex.exec(content);
    const value = match ? match[1]?.trim() : "(not set)";
    process.stdout.write(`  ${rel}: ${target.variable}=${value}\n`);
  }

  process.stdout.write("\nExample Source Paths in Repository:\n");
  for (const sourcePath of EXAMPLE_MODULE_PATHS) {
    const full = path.join(rootDir, sourcePath);
    const exists = fs.existsSync(full);
    process.stdout.write(`  ${sourcePath}: ${exists ? "Present" : "Absent"}\n`);
  }
}

function disableExamples(dryRun) {
  process.stdout.write(`\nDisabling example features (dryRun=${dryRun})...\n\n`);

  for (const target of ENV_TARGETS) {
    const rel = path.relative(rootDir, target.path);
    if (!fs.existsSync(target.path)) {
      process.stdout.write(`  [skip] ${rel} does not exist.\n`);
      continue;
    }

    const content = fs.readFileSync(target.path, "utf8");
    const regex = new RegExp(`^${target.variable}=.*$`, "m");
    let updated;

    if (regex.test(content)) {
      updated = content.replace(regex, `${target.variable}=false`);
    } else {
      updated = `${content.trimEnd()}\n${target.variable}=false\n`;
    }

    if (content === updated) {
      process.stdout.write(`  [unchanged] ${rel} already has ${target.variable}=false\n`);
    } else {
      if (dryRun) {
        process.stdout.write(`  [dry-run] Would update ${rel} -> ${target.variable}=false\n`);
      } else {
        fs.writeFileSync(target.path, updated, "utf8");
        process.stdout.write(`  [updated] ${rel} -> ${target.variable}=false\n`);
      }
    }
  }

  if (dryRun) {
    process.stdout.write("\nDry-run complete. Run with --yes to apply changes.\n");
  } else {
    process.stdout.write("\nSuccessfully disabled example features across local environments.\n");
  }
}

function main() {
  if (isHelp || args.length === 0) {
    printHelp();
    return;
  }

  if (isStatus) {
    checkStatus();
    return;
  }

  if (isDisable) {
    const dryRun = !isYes || isDryRun;
    disableExamples(dryRun);
    return;
  }

  if (args.includes("--removal-plan")) {
    printRemovalPlan();
    return;
  }

  printHelp();
}

main();
