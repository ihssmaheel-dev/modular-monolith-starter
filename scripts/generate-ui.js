#!/usr/bin/env node
const { generateUiComponent } = require("./generators/ui.generator");

const componentName = process.argv[2];

if (!componentName || componentName.startsWith("--")) {
  console.error("Error: Component name is required.");
  console.error("Usage: pnpm generate:ui <component-name>");
  console.error("Example: pnpm generate:ui stat-card");
  console.error("Example: pnpm generate:ui summary-metric");
  process.exit(1);
}

try {
  generateUiComponent({
    rootPath: process.cwd(),
    componentName,
  });
} catch (err) {
  console.error(`\nGeneration Failed: ${err.message}`);
  process.exit(1);
}
