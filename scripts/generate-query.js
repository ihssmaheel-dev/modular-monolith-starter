#!/usr/bin/env node
const { generateAction } = require("./generators/action.generator");

const moduleName = process.argv[2];
const actionName = process.argv[3];
const isCollection = process.argv.includes("--collection");

if (!moduleName || !actionName || actionName.startsWith("--")) {
  console.error("Error: Module and query name are required.");
  console.error("Usage: pnpm generate:query <module> <query-name> [--collection]");
  console.error("Example: pnpm generate:query notes get-note-history");
  console.error("Example: pnpm generate:query tasks get-statistics --collection");
  process.exit(1);
}

try {
  generateAction({
    rootPath: process.cwd(),
    moduleName,
    actionName,
    type: "query",
    isCollection,
  });
} catch (err) {
  console.error(`\nGeneration Failed: ${err.message}`);
  process.exit(1);
}
