const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  applyPlan,
  buildProjectPlan,
  createLocalEnvironmentPlan,
} = require("./project-init/project-plan");
const { parseArguments } = require("./project-init/options");

const ROOT = path.resolve(__dirname, "..");

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  const plan = buildProjectPlan(ROOT, options);
  printPlan(options, plan);

  if (options.check) {
    if (plan.length) {
      throw new Error(
        `Brand configuration drift found in ${plan.map(({ file }) => file).join(", ")}.`,
      );
    }
    process.stdout.write("\nBrand configuration is synchronized.\n");
    return;
  }
  if (options.dryRun) {
    process.stdout.write("\nDry run complete. No files were changed.\n");
    return;
  }
  if (!options.yes) {
    throw new Error("No changes made. Re-run with --yes after reviewing the dry-run plan.");
  }
  if (!options.allowDirty) assertCleanWorkingTree();

  applyWithVerification(options, plan);
  if (options.resetLocalEnv) applyPlan(ROOT, createLocalEnvironmentPlan(ROOT));
  printSuccess(options, plan.length);
}

function applyWithVerification(options, plan) {
  applyPlan(ROOT, plan);
  try {
    const remaining = buildProjectPlan(ROOT, options);
    if (remaining.length) {
      throw new Error(
        `Post-write verification failed for ${remaining.map(({ file }) => file).join(", ")}.`,
      );
    }
  } catch (error) {
    applyPlan(
      ROOT,
      plan.map(({ file, before, after }) => ({ file, before: after, after: before })),
    );
    throw error;
  }
}

function printPlan(options, plan) {
  process.stdout.write(`Project: ${options.name}\n`);
  process.stdout.write(`Slug: ${options.slug}\n`);
  process.stdout.write(`Mobile identifier: ${options.bundleId}\n`);
  process.stdout.write(`URL scheme: ${options.scheme}\n`);
  if (options.repositoryUrl) process.stdout.write(`Repository: ${options.repositoryUrl}\n`);
  process.stdout.write("\nPlanned tracked changes:\n");
  if (!plan.length) process.stdout.write("  none (already synchronized)\n");
  for (const { file } of plan) process.stdout.write(`  update ${file}\n`);
  if (options.resetLocalEnv) {
    process.stdout.write("\nLocal-only changes:\n");
    for (const file of ["apps/api/.env", "apps/web/.env", "apps/mobile/.env"]) {
      process.stdout.write(`  recreate ${file}\n`);
    }
  }
}

function printSuccess(options, changedFiles) {
  process.stdout.write(
    `\nInitialized ${options.name} (${options.slug}); ${changedFiles} tracked files updated.\n`,
  );
  process.stdout.write("\nManual brand assets still requiring product-specific input:\n");
  process.stdout.write("  1. Replace the Expo icon, adaptive icon, splash image, and favicon.\n");
  process.stdout.write(
    "  2. Set packages/design-tokens/src/presets/active.json and run pnpm theme:generate.\n",
  );
  process.stdout.write(
    "  3. Review production domains, sender addresses, legal copy, and store metadata.\n",
  );
  process.stdout.write(
    "  4. Run pnpm project:init with --check in CI using these same identity values.\n",
  );
  process.stdout.write(
    "  5. Review docs/STARTING_A_NEW_PROJECT.md before adding product modules.\n",
  );
}

function printHelp() {
  process.stdout.write("Usage:\n");
  process.stdout.write(
    '  pnpm project:init --name "Acme Portal" --bundle-id com.acme.portal [options]\n\n',
  );
  process.stdout.write("Required:\n");
  process.stdout.write("  --name <name>            Human-readable product name\n");
  process.stdout.write(
    "  --bundle-id <id>         Immutable iOS/Android reverse-DNS identifier\n\n",
  );
  process.stdout.write("Options:\n");
  process.stdout.write(
    "  --slug <slug>            Product/package/container slug (derived from name)\n",
  );
  process.stdout.write("  --url-scheme <scheme>    Mobile deep-link scheme (defaults to slug)\n");
  process.stdout.write(
    "  --repository-url <url>   HTTPS repository URL for dashboard runbook links\n",
  );
  process.stdout.write(
    "  --reset-local-env        Recreate ignored .env files with fresh local secrets\n",
  );
  process.stdout.write("  --dry-run                Show exact files without writing\n");
  process.stdout.write("  --check                  Fail when identity surfaces have drifted\n");
  process.stdout.write("  --yes                    Apply the reviewed plan\n");
  process.stdout.write("  --allow-dirty            Permit unrelated working-tree changes\n");
}

function assertCleanWorkingTree() {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error("Unable to inspect the git working tree.");
  if (result.stdout.trim()) {
    throw new Error("Working tree is not clean. Commit or stash existing changes first.");
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`\nProject initialization failed: ${error.message}\n`);
  process.exitCode = 1;
}
