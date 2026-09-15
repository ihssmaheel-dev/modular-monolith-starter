const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "../apps/web/dist/client");
const MAX_ASSET_GZIP_BYTES = 350 * 1024;
const MAX_TOTAL_GZIP_BYTES = 1200 * 1024;

if (!fs.existsSync(root)) throw new Error("Build apps/web before checking bundle budgets");

const scripts = collect(root).filter((file) => file.endsWith(".js"));
const sizes = scripts.map((file) => ({ file, bytes: zlib.gzipSync(fs.readFileSync(file)).length }));
const oversized = sizes.filter((asset) => asset.bytes > MAX_ASSET_GZIP_BYTES);
const total = sizes.reduce((sum, asset) => sum + asset.bytes, 0);

if (oversized.length > 0 || total > MAX_TOTAL_GZIP_BYTES) {
  const details = oversized
    .map((asset) => `${path.basename(asset.file)}=${asset.bytes}`)
    .join(", ");
  throw new Error(`Web bundle budget exceeded: total=${total}; oversized=${details || "none"}`);
}

console.log(`Web bundle budget passed: ${scripts.length} scripts, ${total} gzip bytes total.`);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(file) : [file];
  });
}
