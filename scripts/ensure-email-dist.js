const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const emailDist = path.join(ROOT, "packages", "email", "dist");

if (!fs.existsSync(emailDist) || fs.readdirSync(emailDist).length === 0) {
  console.log("[pretest] @repo/email dist not found. Building @repo/email once...");
  execSync("pnpm --filter @repo/email build", { stdio: "inherit", cwd: ROOT });
}
