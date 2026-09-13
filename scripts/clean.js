#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const isAll = process.argv.includes("--all");

console.log(`[clean] Starting ${isAll ? "deep" : "standard"} clean...`);

// Attempt turbo clean
try {
  execSync("turbo clean", { stdio: "ignore", cwd: rootDir });
} catch {
  // Turbo might not be globally installed or build cache might already be clean
}

function removePath(targetPath) {
  if (fs.existsSync(targetPath)) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      console.log(`  Removed: ${path.relative(rootDir, targetPath)}`);
    } catch (err) {
      console.warn(`  Failed to remove ${targetPath}: ${err.message}`);
    }
  }
}

// Top-level targets
removePath(path.join(rootDir, "node_modules"));
removePath(path.join(rootDir, ".turbo"));

if (isAll) {
  const subdirs = ["apps", "packages"];
  for (const subdir of subdirs) {
    const dirPath = path.join(rootDir, subdir);
    if (!fs.existsSync(dirPath)) continue;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(dirPath, entry.name);
      removePath(path.join(projectPath, "node_modules"));
      removePath(path.join(projectPath, "dist"));
      removePath(path.join(projectPath, ".turbo"));
      removePath(path.join(projectPath, ".vinxi"));
      removePath(path.join(projectPath, ".expo"));
    }
  }
}

console.log("[clean] Complete.");
