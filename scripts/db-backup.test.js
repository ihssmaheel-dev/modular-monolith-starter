const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { gzipSync } = require("node:zlib");
const { test } = require("node:test");

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const scriptRoot = __dirname;
const databaseUrl = "postgres://backup:private-password@db.example.test/app";

function shellPath(value) {
  return value
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "starter-backup-test-"));
  context.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("starter-backup-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const bin = path.join(root, "commands");
  const directory = path.join(root, "backups with spaces");
  fs.mkdirSync(bin);
  fs.mkdirSync(directory);
  fs.writeFileSync(
    path.join(bin, "pg_dump"),
    '#!/usr/bin/env bash\nprintf "SELECT 1;\\n"\nif [[ "${TEST_DUMP_FAIL:-}" == "true" ]]; then exit 1; fi\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(bin, "psql"), "#!/usr/bin/env bash\ncat >/dev/null\n", {
    mode: 0o755,
  });
  return {
    directory,
    run(script, argument, extraEnv = {}) {
      return spawnSync(
        bash,
        [
          "-c",
          'export PATH="$TEST_STUB_BIN:$PATH"; exec bash "$TEST_SCRIPT" "$1"',
          "--",
          shellPath(argument),
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            TEST_STUB_BIN: shellPath(bin),
            TEST_SCRIPT: shellPath(path.join(scriptRoot, script)),
            ...extraEnv,
          },
        },
      );
    },
  };
}

test("backup atomically publishes valid archives and retains literal paths", (context) => {
  const { directory, run } = fixture(context);
  const old = path.join(directory, "pg_backup_old.sql.gz");
  fs.writeFileSync(old, gzipSync("old"));
  fs.utimesSync(old, new Date(0), new Date(0));
  const unrelated = path.join(directory, "keep.sql.gz");
  fs.writeFileSync(unrelated, gzipSync("keep"));

  const result = run("db-backup.sh", directory, { BACKUP_RETENTION_COUNT: "1" });
  assert.equal(result.status, 0, result.stderr);
  const archives = fs.readdirSync(directory);
  assert.equal(archives.filter((file) => file.startsWith("pg_backup_")).length, 1);
  assert.ok(!fs.existsSync(old));
  assert.ok(fs.existsSync(unrelated));
  assert.ok(archives.every((file) => !file.endsWith(".part")));
});

test("a failed dump removes its partial file and preserves the last good backup", (context) => {
  const { directory, run } = fixture(context);
  fs.writeFileSync(path.join(directory, "pg_backup_good.sql.gz"), gzipSync("good"));
  const result = run("db-backup.sh", directory, { TEST_DUMP_FAIL: "true" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(directory), ["pg_backup_good.sql.gz"]);
});

test("invalid retention fails before creating or pruning backups", (context) => {
  const { directory, run } = fixture(context);
  fs.writeFileSync(path.join(directory, "pg_backup_good.sql.gz"), gzipSync("good"));
  const result = run("db-backup.sh", directory, { BACKUP_RETENTION_COUNT: "0" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(directory), ["pg_backup_good.sql.gz"]);
});

test("restore never prints database credentials", (context) => {
  const { directory, run } = fixture(context);
  const archive = path.join(directory, "pg_backup_good.sql.gz");
  fs.writeFileSync(archive, gzipSync("SELECT 1;"));
  const result = run("db-restore.sh", archive);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!`${result.stdout}${result.stderr}`.includes("private-password"));
});
