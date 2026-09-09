const fs = require("node:fs");
const path = require("node:path");

const webDirectory = path.resolve(__dirname, "../apps/web");
const source = path.join(webDirectory, ".env.example");
const destination = path.join(webDirectory, ".env");

if (!fs.existsSync(destination)) {
  fs.copyFileSync(source, destination);
  process.stdout.write("Created apps/web/.env from .env.example\n");
} else {
  const content = fs.readFileSync(destination, "utf8");
  const hasLegacyLocalApiUrl = /^VITE_API_URL=http:\/\/localhost:3000\/api\s*$/m.test(content);
  const hasStalePortApiUrl = /^VITE_API_URL=http:\/\/localhost:3000\/api\/v1\s*$/m.test(content);
  if (hasLegacyLocalApiUrl || hasStalePortApiUrl || !content.includes("VITE_API_URL=http")) {
    fs.copyFileSync(source, destination);
    process.stdout.write(
      "Fixed apps/web/.env — restored VITE_API_URL=http://localhost:5156/api/v1\n",
    );
  }
}
