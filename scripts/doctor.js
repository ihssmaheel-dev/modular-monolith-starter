#!/usr/bin/env node

const { runChecks } = require("./doctor/checks");
const { printHelp, printReport } = require("./doctor/reporter");

const SUPPORTED_OPTIONS = new Set(["--help", "-h", "--json", "--strict", "--skip-services"]);

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const unknown = args.filter((arg) => !SUPPORTED_OPTIONS.has(arg));
  if (unknown.length > 0) {
    process.stderr.write(`Unknown doctor option: ${unknown.join(", ")}\n\n`);
    printHelp(process.stderr);
    process.exitCode = 2;
    return;
  }
  if (args.includes("--help") || args.includes("-h")) {
    printHelp(process.stdout);
    return;
  }

  const options = {
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    skipServices: args.includes("--skip-services"),
  };
  const startedAt = Date.now();
  const results = await runChecks(options);
  const report = printReport(results, options, Date.now() - startedAt);
  process.exitCode = report.failed || (options.strict && report.warned) ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`Doctor could not complete: ${error.message}\n`);
  process.exitCode = 1;
});
