const { createHash } = require("node:crypto");
const { readdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationDirectory = path.join(root, "migrations", "pg");
const journalPath = path.join(migrationDirectory, "meta", "_journal.json");
const checksumPath = path.join(migrationDirectory, "checksums.json");

async function migrationFiles() {
  return (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name))
    .sort();
}

async function expectedFiles() {
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const entries = journal.entries;
  for (const [index, entry] of entries.entries()) {
    if (entry.idx !== index || !/^\d{4}_[a-z0-9_]+$/i.test(entry.tag)) {
      throw new Error(`Invalid migration journal entry at index ${index}`);
    }
  }
  return entries.map((entry) => `${entry.tag}.sql`);
}

async function checksums(files) {
  const entries = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(path.join(migrationDirectory, file));
      return [file, createHash("sha256").update(content).digest("hex")];
    }),
  );
  return Object.fromEntries(entries);
}

async function main() {
  const expected = await expectedFiles();
  const actual = await migrationFiles();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Migration SQL files and Drizzle journal entries do not match");
  }
  const current = await checksums(actual);
  if (process.argv.includes("--update")) {
    await writeFile(checksumPath, `${JSON.stringify(current, null, 2)}\n`);
    process.stdout.write("Migration checksum manifest updated.\n");
    return;
  }
  const frozen = JSON.parse(await readFile(checksumPath, "utf8"));
  for (const file of actual) {
    if (frozen[file] !== current[file]) {
      throw new Error(`${file} changed after it was frozen; add a new migration instead`);
    }
  }
  if (Object.keys(frozen).length !== actual.length) {
    throw new Error("Migration checksum manifest contains missing or unknown files");
  }
  process.stdout.write(`Verified ${actual.length} immutable migrations.\n`);
}

main().catch((error) => {
  process.stderr.write(`Migration lineage check failed: ${String(error)}\n`);
  process.exitCode = 1;
});
