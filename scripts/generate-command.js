#!/usr/bin/env node
const { generateAction } = require("./generators/action.generator");

const moduleName = process.argv[2];
const actionName = process.argv[3];
const isCollection = process.argv.includes("--collection");

if (!moduleName || !actionName || actionName.startsWith("--")) {
  console.error("Error: Module and command name are required.");
  console.error("Usage: pnpm generate:command <module> <command-name> [--collection]");
  console.error("Example: pnpm generate:command notes publish-note");
  console.error("Example: pnpm generate:command tasks batch-archive --collection");
  process.exit(1);
}

try {
  generateAction({
    rootPath: process.cwd(),
    moduleName,
    actionName,
    type: "command",
    isCollection,
  });
} catch (err) {
  console.error(`\nGeneration Failed: ${err.message}`);
  process.exit(1);
}
