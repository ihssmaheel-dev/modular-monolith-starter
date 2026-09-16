const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, it } = require("node:test");
const {
  BRAND_FILES,
  applyPlan,
  buildProjectPlan,
  createLocalEnvironmentPlan,
} = require("./project-plan");
const { parseArguments } = require("./options");

const REPOSITORY_ROOT = path.resolve(__dirname, "../..");
const temporaryRoots = [];
const identity = {
  name: "Acme Portal",
  slug: "acme-portal",
  bundleId: "com.acme.portal",
  scheme: "acme-portal",
  repositoryUrl: "https://github.com/acme/portal",
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("project identity options", () => {
  it("derives safe defaults while preserving irreversible mobile identity", () => {
    const options = parseArguments(["--name", "Acme Portal", "--bundle-id", "com.acme.portal"]);
    assert.deepEqual(
      {
        name: options.name,
        slug: options.slug,
        scheme: options.scheme,
        bundleId: options.bundleId,
      },
      {
        name: "Acme Portal",
        slug: "acme-portal",
        scheme: "acme-portal",
        bundleId: "com.acme.portal",
      },
    );
  });

  it("rejects an omitted mobile bundle identifier", () => {
    assert.throws(() => parseArguments(["--name", "Acme Portal"]), /--bundle-id is required/);
  });

  it("rejects unknown options instead of silently ignoring typos", () => {
    assert.throws(
      () => parseArguments(["--name", "Acme Portal", "--bundle-id", "com.acme.portal", "--slgu"]),
      /Unknown option/,
    );
  });
});

describe("project branding plan", () => {
  it("updates every registered surface and is idempotent", () => {
    const root = createFixture();
    const plan = buildProjectPlan(root, identity);
    assert.ok(plan.length >= 20);
    applyPlan(root, plan);
    assert.deepEqual(buildProjectPlan(root, identity), []);

    assert.equal(readJson(root, "package.json").name, "acme-portal");
    const expo = readJson(root, "apps/mobile/app.json").expo;
    assert.equal(expo.name, "Acme Portal");
    assert.equal(expo.ios.bundleIdentifier, "com.acme.portal");
    assert.equal(expo.android.package, "com.acme.portal");
    assert.match(read(root, "docker/docker-compose.staging.yml"), /acme-portal-staging-api/);
    assert.match(read(root, "docker/observability/prometheus/alerts.yml"), /acme-portal-\.\*/);
    assert.doesNotMatch(read(root, "docker/observability/alloy/config.alloy"), /monorepo/);
    assert.match(
      read(root, "packages/contracts/src/schemas/env.schema.ts"),
      /APP_NAME:[\s\S]*default\("Acme Portal"\)/,
    );
  });

  it("recreates local environments with unique non-placeholder secrets", () => {
    const root = createFixture();
    applyPlan(root, buildProjectPlan(root, identity));
    applyPlan(root, createLocalEnvironmentPlan(root));
    const apiEnvironment = read(root, "apps/api/.env");
    assert.match(apiEnvironment, /^APP_NAME=Acme Portal$/m);
    assert.doesNotMatch(apiEnvironment, /change-in-prod|optional-development-metrics-token/);
    assert.equal(read(root, "apps/web/.env"), read(root, "apps/web/.env.example"));
  });

  it("fails loudly when a registered branding surface has drifted", () => {
    const root = createFixture();
    const composePath = path.join(root, "docker/docker-compose.staging.yml");
    fs.writeFileSync(
      composePath,
      fs.readFileSync(composePath, "utf8").replace("monorepo-staging-api", "drifted-api"),
    );
    assert.throws(() => buildProjectPlan(root, identity), /outside the acme-portal namespace/);
  });
});

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-init-"));
  temporaryRoots.push(root);
  for (const file of BRAND_FILES) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPOSITORY_ROOT, file), target);
  }
  return root;
}

function read(root, file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function readJson(root, file) {
  return JSON.parse(read(root, file));
}
