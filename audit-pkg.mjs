#!/usr/bin/env node
/**
 * pkg-audit.mjs — scan a monorepo for every package.json, summarize each
 * workspace, and cross-check dependency versions across all of them so
 * drift between the web client and shared packages is obvious.
 *
 * Usage:
 *   node pkg-audit.mjs [dir] [options]
 *
 * Options:
 *   --json[=file]        Emit JSON (stdout, or to `file` if given) instead of the report
 *   --workspace=<name>   Show full dependency detail for one workspace only
 *                         (matches package "name" or its relative path)
 *   --full               Show the full dependency matrix for every workspace
 *   --outdated           Check every real (non-workspace/catalog) dependency against
 *                         the npm registry and flag stale ones (needs internet)
 *   --versions           Show EVERY dependency with current vs latest npm version
 *                         (not just the stale ones — needs internet)
 *   --changelog           With --outdated, fetch release notes for each outdated
 *                         package from GitHub Releases (needs internet, uses the
 *                         unauthenticated GitHub API — 60 req/hr limit applies)
 *   --changelog-lines=N   Max lines of release-notes body to show per package (default 6)
 *   --concurrency=N       Parallel registry requests for --outdated/--versions (default 8)
 *   --top=N              Show N most-shared dependencies (default 10, 0 to hide)
 *   --only-conflicts     Skip the workspace list, show only the conflicts section
 *   --ignore-dir=a,b     Extra directory names to skip (merged with defaults)
 *   --no-gitignore       Don't honor .gitignore files (they're respected by default)
 *   --no-color           Disable ANSI colors
 *   -h, --help           Show this help
 *
 * Example:
 *   node pkg-audit.mjs . --top=15
 *   node pkg-audit.mjs . --workspace=@architecture/web
 *   node pkg-audit.mjs . --outdated
 *   node pkg-audit.mjs . --outdated --changelog
 *   node pkg-audit.mjs . --full --no-color > report.txt
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".idea",
  ".vscode",
  ".vercel",
]);

const DEP_FIELDS = [
  ["dependencies", "prod"],
  ["devDependencies", "dev"],
  ["peerDependencies", "peer"],
  ["optionalDependencies", "optional"],
];

// ---------------------------------------------------------------------------
// CLI argument parsing (zero dependencies)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    target: null,
    json: false,
    jsonFile: null,
    workspace: null,
    top: 10,
    onlyConflicts: false,
    full: false,
    outdated: false,
    versions: false,
    changelog: false,
    changelogLines: 6,
    concurrency: 8,
    ignoreDirs: new Set(DEFAULT_IGNORE_DIRS),
    respectGitignore: true,
    color: process.stdout.isTTY && !("NO_COLOR" in process.env),
    help: false,
  };

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "--no-color") {
      opts.color = false;
    } else if (arg === "--no-gitignore") {
      opts.respectGitignore = false;
    } else if (arg === "--only-conflicts") {
      opts.onlyConflicts = true;
    } else if (arg === "--full") {
      opts.full = true;
    } else if (arg === "--outdated") {
      opts.outdated = true;
    } else if (arg === "--versions") {
      opts.versions = true;
    } else if (arg === "--changelog") {
      opts.changelog = true;
    } else if (arg.startsWith("--changelog-lines=")) {
      const n = Number(arg.split("=")[1]);
      opts.changelogLines = Number.isFinite(n) && n > 0 ? n : 6;
    } else if (arg.startsWith("--concurrency=")) {
      const n = Number(arg.split("=")[1]);
      opts.concurrency = Number.isFinite(n) && n > 0 ? n : 8;
    } else if (arg.startsWith("--top=")) {
      const n = Number(arg.split("=")[1]);
      opts.top = Number.isFinite(n) && n >= 0 ? n : 10;
    } else if (arg.startsWith("--workspace=")) {
      opts.workspace = arg.split("=").slice(1).join("=");
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg.startsWith("--json=")) {
      opts.json = true;
      opts.jsonFile = arg.split("=")[1];
    } else if (arg.startsWith("--ignore-dir=")) {
      arg
        .split("=")[1]
        .split(",")
        .forEach((d) => d && opts.ignoreDirs.add(d));
    } else if (!arg.startsWith("-")) {
      opts.target = arg;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`pkg-audit — scan a monorepo's package.json files and cross-check versions

Usage:
  node pkg-audit.mjs [dir] [options]

Options:
  --json[=file]         Emit JSON (stdout, or to file if given)
  --workspace=<name>    Full dependency detail for one workspace (name or path)
  --full                Full dependency matrix for every workspace
  --outdated            Check versions against the npm registry (needs internet)
  --versions            Show EVERY dependency with current vs latest npm version
  --changelog           With --outdated, fetch GitHub release notes per package
  --changelog-lines=N   Max lines of release notes to show per package (default 6)
  --concurrency=N       Parallel registry requests for --outdated/--versions (default 8)
  --top=N               Show N most-shared dependencies (default 10, 0 to hide)
  --only-conflicts      Skip the workspace list, show only conflicts
  --ignore-dir=a,b      Extra directory names to skip
  --no-gitignore        Don't honor .gitignore files (respected by default)
  --no-color            Disable ANSI colors
  -h, --help            Show this help`);
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

function makeColorizer(enabled) {
  const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    dim: wrap("2"),
    bold: wrap("1"),
    blue: wrap("34"),
    green: wrap("32"),
    yellow: wrap("33"),
    red: wrap("31"),
    cyan: wrap("36"),
  };
}

// ---------------------------------------------------------------------------
// Minimal .gitignore support (no dependency) — parses standard gitignore
// syntax (comments, negation with !, directory-only trailing /, anchored
// leading /, * ? and ** globs) and applies nested .gitignore files the same
// way git does: rules from a nested file only apply within its own subtree,
// and later rules win over earlier ones for the same path.
// ---------------------------------------------------------------------------

function globToRegExp(glob, anchored) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          re += "(?:.*/)?";
          i++;
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  const prefix = anchored ? "^" : "^(?:.*/)?";
  return new RegExp(`${prefix}${re}(?:/.*)?$`);
}

function parseGitignoreFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const baseDir = path.dirname(filePath);
  const patterns = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.replace(/\s+$/, ""); // trailing whitespace (not escaped) is stripped by git
    if (!line || line.startsWith("#")) continue;

    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1);
    }

    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }

    let anchored = line.includes("/"); // any inner slash anchors the pattern to baseDir
    if (line.startsWith("/")) {
      anchored = true;
      line = line.slice(1);
    }

    if (!line) continue;

    patterns.push({ regex: globToRegExp(line, anchored), negate, dirOnly, baseDir });
  }

  return patterns;
}

/** Last-matching-pattern-wins, same as git. Patterns not applicable to this
 * candidate's base directory, or dir-only patterns tested against a file,
 * are skipped. */
function isGitignored(absPath, isDir, activePatterns) {
  let ignored = false;
  for (const p of activePatterns) {
    if (p.dirOnly && !isDir) continue;
    const rel = path.relative(p.baseDir, absPath).split(path.sep).join("/");
    if (rel.startsWith("..")) continue; // candidate isn't under this pattern's base dir
    if (p.regex.test(rel)) ignored = !p.negate;
  }
  return ignored;
}

// ---------------------------------------------------------------------------
// Discovery: find every package.json, skipping ignored dirs
// ---------------------------------------------------------------------------

function findPackageJsonFiles(dir, opts, stats, results = [], inheritedPatterns = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    stats.errors.push({ path: dir, error: err.code || err.message });
    return results;
  }

  let activePatterns = inheritedPatterns;
  if (opts.respectGitignore && entries.some((e) => e.name === ".gitignore")) {
    const local = parseGitignoreFile(path.join(dir, ".gitignore"));
    if (local.length) activePatterns = [...inheritedPatterns, ...local];
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // skip symlinks entirely — kept simple & cycle-safe

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (opts.ignoreDirs.has(entry.name)) {
        continue;
      }
      if (opts.respectGitignore && isGitignored(full, true, activePatterns)) {
        stats.skippedGitignored = (stats.skippedGitignored || 0) + 1;
        continue;
      }
      findPackageJsonFiles(full, opts, stats, results, activePatterns);
    } else if (entry.name === "package.json") {
      if (opts.respectGitignore && isGitignored(full, false, activePatterns)) {
        stats.skippedGitignored = (stats.skippedGitignored || 0) + 1;
        continue;
      }
      results.push(full);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Parsing a single package.json into a workspace record
// ---------------------------------------------------------------------------

function loadWorkspace(filePath, rootDir, stats) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    stats.errors.push({ path: filePath, error: err.code || err.message });
    return null;
  }

  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (err) {
    stats.errors.push({ path: filePath, error: `invalid JSON — ${err.message}` });
    return null;
  }

  const relPath = path.relative(rootDir, path.dirname(filePath)) || ".";
  const deps = {}; // name -> { version, type }

  for (const [field, type] of DEP_FIELDS) {
    const block = pkg[field];
    if (!block || typeof block !== "object") continue;
    for (const [name, version] of Object.entries(block)) {
      deps[name] = { version: String(version), type };
    }
  }

  return {
    relPath,
    absPath: filePath,
    name: pkg.name || `(unnamed: ${relPath})`,
    version: pkg.version || "0.0.0",
    private: !!pkg.private,
    isRoot: relPath === ".",
    packageManager: pkg.packageManager || null,
    enginesNode: (pkg.engines && pkg.engines.node) || null,
    deps,
    depCount: Object.keys(deps).length,
    devCount: Object.values(deps).filter((d) => d.type === "dev").length,
  };
}

// ---------------------------------------------------------------------------
// Cross-workspace dependency map + conflict detection
// ---------------------------------------------------------------------------

function isLinkedProtocol(version) {
  return (
    version.startsWith("workspace:") ||
    version.startsWith("catalog:") ||
    version.startsWith("link:")
  );
}

function parseMajor(version) {
  const cleaned = version.replace(/^[\^~<>=\s]+/, "");
  const m = cleaned.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function buildDependencyMap(workspaces) {
  // name -> version -> [{ workspace, type }]
  const map = new Map();

  for (const ws of workspaces) {
    for (const [name, { version, type }] of Object.entries(ws.deps)) {
      if (!map.has(name)) map.set(name, new Map());
      const versions = map.get(name);
      if (!versions.has(version)) versions.set(version, []);
      versions.get(version).push({ workspace: ws.relPath, type });
    }
  }

  return map;
}

function findConflicts(depMap) {
  const conflicts = [];

  for (const [name, versions] of depMap.entries()) {
    // Ignore workspace:/catalog:/link: entries entirely for conflict purposes —
    // those are intentionally shared/linked, not independent version choices.
    const realVersions = [...versions.entries()].filter(([v]) => !isLinkedProtocol(v));
    if (realVersions.length <= 1) continue;

    const majors = new Set(realVersions.map(([v]) => parseMajor(v)));
    const severity = majors.size > 1 ? "major" : "range";

    conflicts.push({
      name,
      severity,
      versions: realVersions.map(([version, occurrences]) => ({ version, occurrences })),
    });
  }

  conflicts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "major" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return conflicts;
}

// ---------------------------------------------------------------------------
// Hygiene checks — no network required
// ---------------------------------------------------------------------------

function findHygieneIssues(workspaces) {
  const issues = [];

  // Unnamed manifests: likely not real workspaces (tool caches, stray configs).
  const unnamed = workspaces.filter((w) => w.name.startsWith("(unnamed:"));
  for (const w of unnamed) {
    issues.push({
      kind: "unnamed",
      message: `${w.relPath} has no "name" field — likely not a real workspace (tool cache/config?). Consider adding it to --ignore-dir if so.`,
    });
  }

  // Duplicate names across different manifests (copy-paste smell).
  const byName = new Map();
  for (const w of workspaces) {
    if (w.name.startsWith("(unnamed:")) continue;
    if (!byName.has(w.name)) byName.set(w.name, []);
    byName.get(w.name).push(w.relPath);
  }
  for (const [name, paths] of byName.entries()) {
    if (paths.length > 1) {
      issues.push({
        kind: "duplicate-name",
        message: `"${name}" is used by ${paths.length} manifests: ${paths.join(", ")}`,
      });
    }
  }

  // packageManager field inconsistency (matters a lot for pnpm workspaces —
  // mismatched versions can cause different lockfile resolution per package).
  const pmValues = new Map(); // value -> [relPath]
  for (const w of workspaces) {
    if (!w.packageManager) continue;
    if (!pmValues.has(w.packageManager)) pmValues.set(w.packageManager, []);
    pmValues.get(w.packageManager).push(w.relPath);
  }
  if (pmValues.size > 1) {
    const detail = [...pmValues.entries()]
      .map(([v, paths]) => `${v} (${paths.join(", ")})`)
      .join("; ");
    issues.push({
      kind: "packageManager",
      message: `"packageManager" differs across manifests: ${detail}`,
    });
  }

  // engines.node inconsistency.
  const engineValues = new Map();
  for (const w of workspaces) {
    if (!w.enginesNode) continue;
    if (!engineValues.has(w.enginesNode)) engineValues.set(w.enginesNode, []);
    engineValues.get(w.enginesNode).push(w.relPath);
  }
  if (engineValues.size > 1) {
    const detail = [...engineValues.entries()]
      .map(([v, paths]) => `${v} (${paths.join(", ")})`)
      .join("; ");
    issues.push({ kind: "engines", message: `"engines.node" differs across manifests: ${detail}` });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// --outdated: check real dependency versions against the npm registry
// ---------------------------------------------------------------------------

function parseVersionTuple(version) {
  const cleaned = version.replace(/^[\^~<>=\s]+/, "");
  const m = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareTuples(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

async function fetchLatestVersion(name, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/latest`, {
      signal: controller.signal,
    });
    if (!res.ok) return { name, status: res.status === 404 ? "not-published" : "error" };
    const data = await res.json();
    return { name, status: "ok", latest: data.version };
  } catch (err) {
    return { name, status: "network-error", error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

async function checkOutdated(depMap, concurrency) {
  // One representative (highest declared) version per package name — we're
  // checking staleness, not re-deriving the conflict list.
  const names = [...depMap.keys()].filter((name) => {
    const versions = [...depMap.get(name).keys()].filter((v) => !isLinkedProtocol(v));
    return versions.length > 0;
  });

  const registryResults = await runPool(names, (name) => fetchLatestVersion(name), concurrency);
  const byName = new Map(registryResults.map((r) => [r.name, r]));

  // Build one record per checked package, regardless of status, so callers
  // can either show everything (--versions) or just the problems (--outdated).
  const all = [];

  for (const name of names) {
    const result = byName.get(name);
    if (!result) continue;

    if (result.status === "not-published") {
      all.push({ name, current: null, latest: null, status: "not-published" });
      continue;
    }
    if (result.status !== "ok") {
      all.push({
        name,
        current: null,
        latest: null,
        status: "error",
        error: result.error || "check failed",
      });
      continue;
    }

    const versions = [...depMap.get(name).keys()].filter((v) => !isLinkedProtocol(v));
    // Use the highest declared version across workspaces as "current" for this package.
    let current = null;
    for (const v of versions) {
      const t = parseVersionTuple(v);
      if (t && (!current || compareTuples(t, current.tuple) > 0)) current = { raw: v, tuple: t };
    }
    const latestTuple = parseVersionTuple(result.latest);

    if (!current || !latestTuple) {
      all.push({
        name,
        current: current ? current.raw : null,
        latest: result.latest,
        status: "unknown",
      });
      continue;
    }

    const cmp = compareTuples(latestTuple, current.tuple);
    if (cmp <= 0) {
      all.push({ name, current: current.raw, latest: result.latest, status: "up-to-date" });
      continue;
    }

    const status =
      latestTuple[0] > current.tuple[0]
        ? "major"
        : latestTuple[1] > current.tuple[1]
          ? "minor"
          : "patch";
    all.push({ name, current: current.raw, latest: result.latest, status });
  }

  const severityOrder = {
    major: 0,
    minor: 1,
    patch: 2,
    unknown: 3,
    "not-published": 4,
    error: 5,
    "up-to-date": 6,
  };
  const sortedAll = [...all].sort(
    (a, b) => severityOrder[a.status] - severityOrder[b.status] || a.name.localeCompare(b.name),
  );

  return {
    all: sortedAll,
    outdated: sortedAll.filter(
      (r) => r.status === "major" || r.status === "minor" || r.status === "patch",
    ),
    unpublished: sortedAll.filter((r) => r.status === "not-published").map((r) => r.name),
    networkErrors: sortedAll
      .filter((r) => r.status === "error")
      .map((r) => ({ name: r.name, error: r.error })),
    upToDate: sortedAll.filter((r) => r.status === "up-to-date"),
  };
}

// ---------------------------------------------------------------------------
// --changelog: fetch GitHub release notes for outdated packages
// ---------------------------------------------------------------------------

function extractGithubRepo(repoField) {
  if (!repoField) return null;
  let url = typeof repoField === "string" ? repoField : repoField.url;
  if (!url) return null;

  url = url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/");

  const m = url.match(/github\.com[/:]([^/]+)\/([^/#]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json", "User-Agent": "pkg-audit" },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Candidate tag names GitHub projects commonly use for a release. Plain
 * packages usually tag `v1.2.3` or `1.2.3`; monorepo packages (e.g. a repo
 * that publishes many npm packages from one GitHub repo) often prefix with
 * the package name, e.g. `react@19.0.0` or `@scope/name@1.2.3`. */
function candidateTags(name, version) {
  return [`v${version}`, version, `${name}@${version}`, `${name}-v${version}`];
}

async function fetchReleaseNotesForPackage(name, latestVersion, concurrencyGuard) {
  await concurrencyGuard.acquire();
  try {
    // 1. Look up the repository field from the npm registry (full metadata,
    //    not the /latest shortcut, since /latest omits `repository` sometimes
    //    on older publishes — full doc is more reliable).
    const pkgMeta = await fetchNpmFullMetadata(name);
    if (!pkgMeta.ok) {
      return { name, status: "no-repo", reason: "could not load npm metadata" };
    }
    const repo = extractGithubRepo(pkgMeta.repository);
    if (!repo) {
      return { name, status: "no-repo", reason: "no GitHub repository listed on npm" };
    }

    // 2. Try to find a GitHub Release matching one of the likely tag names.
    for (const tag of candidateTags(name, latestVersion)) {
      const res = await fetchJson(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/tags/${encodeURIComponent(tag)}`,
      );
      if (res.ok) {
        return {
          name,
          status: "ok",
          repo: `${repo.owner}/${repo.repo}`,
          tag,
          title: res.data.name || tag,
          url: res.data.html_url,
          publishedAt: res.data.published_at,
          body: res.data.body || "",
        };
      }
      if (res.status === 403) {
        return { name, status: "rate-limited", repo: `${repo.owner}/${repo.repo}` };
      }
    }

    // 3. No exact-tag release found — fall back to the most recent release
    //    listed for the repo, noting it may not exactly match this version
    //    (common for packages that only tag some releases, or where the repo
    //    hosts several packages).
    const listRes = await fetchJson(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=1`,
    );
    if (listRes.ok && Array.isArray(listRes.data) && listRes.data.length) {
      const r = listRes.data[0];
      return {
        name,
        status: "approx",
        repo: `${repo.owner}/${repo.repo}`,
        tag: r.tag_name,
        title: r.name || r.tag_name,
        url: r.html_url,
        publishedAt: r.published_at,
        body: r.body || "",
      };
    }
    if (listRes.status === 403) {
      return { name, status: "rate-limited", repo: `${repo.owner}/${repo.repo}` };
    }

    return { name, status: "no-release", repo: `${repo.owner}/${repo.repo}` };
  } finally {
    concurrencyGuard.release();
  }
}

async function fetchNpmFullMetadata(name, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Scoped names need encoding of the leading @ segment's slash.
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const latest = data["dist-tags"] && data["dist-tags"].latest;
    const repository =
      (latest && data.versions && data.versions[latest] && data.versions[latest].repository) ||
      data.repository;
    return { ok: true, repository };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Simple semaphore so GitHub calls (2 requests per package worst case)
 * don't fan out past a small concurrency limit — the unauthenticated GitHub
 * API allows only 60 requests/hour. */
function makeSemaphore(max) {
  let active = 0;
  const queue = [];
  return {
    async acquire() {
      if (active < max) {
        active++;
        return;
      }
      await new Promise((resolve) => queue.push(resolve));
      active++;
    },
    release() {
      active--;
      const next = queue.shift();
      if (next) next();
    },
  };
}

function cleanReleaseBody(body, maxLines) {
  if (!body) return [];
  const lines = body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trimEnd())
    .filter((l) => l.trim().length > 0 && !/^https?:\/\/\S+$/.test(l.trim()));
  return lines.slice(0, maxLines);
}

async function fetchChangelogs(outdatedList, changelogLines) {
  // GitHub's unauthenticated limit is 60/hr — cap concurrency conservatively
  // regardless of the user's --concurrency setting (that flag is for the npm
  // registry, which is far more permissive).
  const guard = makeSemaphore(4);
  const results = await Promise.all(
    outdatedList.map((pkg) => fetchReleaseNotesForPackage(pkg.name, pkg.latest, guard)),
  );
  const byName = new Map(results.map((r) => [r.name, r]));
  for (const pkg of outdatedList) {
    const r = byName.get(pkg.name);
    if ((r && r.status === "ok") || (r && r.status === "approx")) {
      pkg.changelog = { ...r, bodyLines: cleanReleaseBody(r.body, changelogLines) };
    } else if (r) {
      pkg.changelog = r;
    }
  }
  return outdatedList;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderWorkspaceList(workspaces, c, out) {
  out.push(c.bold(`Workspaces (${workspaces.length}):`));
  const nameW = Math.max(...workspaces.map((w) => w.relPath.length), 9);
  for (const ws of workspaces) {
    const tag = ws.isRoot ? c.dim(" (root)") : ws.private ? c.dim(" (private)") : "";
    out.push(
      `  ${ws.relPath.padEnd(nameW)}  ${c.cyan(ws.name)}${ws.name.length < 28 ? " ".repeat(28 - ws.name.length) : " "}` +
        `v${ws.version}  ${String(ws.depCount - ws.devCount).padStart(3)} deps / ${String(ws.devCount).padStart(3)} dev${tag}`,
    );
  }
  out.push("");
}

function renderConflicts(conflicts, c, out) {
  if (!conflicts.length) {
    out.push(c.green("No version conflicts — every shared dependency is aligned. ✓"));
    out.push("");
    return;
  }

  out.push(c.bold(`Version conflicts (${conflicts.length}):`));
  for (const conflict of conflicts) {
    const marker = conflict.severity === "major" ? c.red("✗") : c.yellow("⚠");
    const tag =
      conflict.severity === "major" ? c.red("major version differs") : c.yellow("range differs");
    out.push(`  ${marker} ${c.bold(conflict.name)}  ${c.dim(`(${tag})`)}`);
    const wsW = Math.max(
      ...conflict.versions.flatMap((v) => v.occurrences.map((o) => o.workspace.length)),
    );
    for (const { version, occurrences } of conflict.versions) {
      for (const occ of occurrences) {
        out.push(`      ${occ.workspace.padEnd(wsW)}  ${version}  ${c.dim(`(${occ.type})`)}`);
      }
    }
  }
  out.push("");
}

function renderTopShared(depMap, top, c, out) {
  if (top <= 0) return;
  const totalWorkspacesUsing = [...depMap.entries()].map(([name, versions]) => {
    const workspaceSet = new Set();
    for (const occurrences of versions.values()) {
      for (const o of occurrences) workspaceSet.add(o.workspace);
    }
    return { name, count: workspaceSet.size };
  });
  totalWorkspacesUsing.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const shown = totalWorkspacesUsing.slice(0, top);
  if (!shown.length) return;

  out.push(c.bold(`Most shared dependencies (top ${shown.length}):`));
  const nameW = Math.max(...shown.map((s) => s.name.length));
  for (const s of shown) {
    out.push(`  ${s.name.padEnd(nameW)}  used in ${s.count} workspace${s.count === 1 ? "" : "s"}`);
  }
  out.push("");
}

function renderHygiene(issues, c, out) {
  if (!issues.length) {
    out.push(c.green("No hygiene issues found. ✓"));
    out.push("");
    return;
  }
  out.push(c.bold(`Hygiene (${issues.length}):`));
  for (const issue of issues) {
    out.push(`  ${c.yellow("⚠")} ${issue.message}`);
  }
  out.push("");
}

function renderOutdated({ outdated, unpublished, networkErrors }, c, out, showChangelog) {
  if (networkErrors.length) {
    out.push(
      c.dim(`(${networkErrors.length} package(s) could not be checked — network/registry issue)`),
    );
  }
  if (!outdated.length) {
    out.push(c.green("Everything is up to date with the npm registry. ✓"));
    out.push("");
    return;
  }

  out.push(c.bold(`Outdated (${outdated.length}):`));
  const nameW = Math.max(...outdated.map((o) => o.name.length));
  for (const o of outdated) {
    const marker =
      o.status === "major" ? c.red("✗") : o.status === "minor" ? c.yellow("⚠") : c.dim("·");
    out.push(
      `  ${marker} ${o.name.padEnd(nameW)}  ${o.current.padEnd(14)} → ${c.bold(o.latest)}  ${c.dim(`(${o.status})`)}`,
    );
    if (showChangelog) renderChangelogBlock(o.changelog, c, out);
  }
  out.push("");
}

function renderChangelogBlock(changelog, c, out) {
  const indent = "        ";
  if (!changelog) {
    out.push(`${indent}${c.dim("(release notes not fetched)")}`);
    return;
  }
  switch (changelog.status) {
    case "ok":
    case "approx": {
      const approxNote =
        changelog.status === "approx"
          ? c.dim(" (closest release found, tag didn't match exactly)")
          : "";
      out.push(`${indent}${c.cyan(changelog.title)}${approxNote}  ${c.dim(`— ${changelog.repo}`)}`);
      if (changelog.publishedAt) {
        out.push(`${indent}${c.dim(new Date(changelog.publishedAt).toISOString().slice(0, 10))}`);
      }
      if (changelog.bodyLines.length) {
        for (const line of changelog.bodyLines) {
          out.push(`${indent}${c.dim("│")} ${line}`);
        }
      } else {
        out.push(`${indent}${c.dim("(release has no notes body)")}`);
      }
      if (changelog.url) out.push(`${indent}${c.dim(changelog.url)}`);
      break;
    }
    case "no-release":
      out.push(`${indent}${c.dim(`no GitHub releases found for ${changelog.repo}`)}`);
      break;
    case "no-repo":
      out.push(`${indent}${c.dim(`no changelog available — ${changelog.reason}`)}`);
      break;
    case "rate-limited":
      out.push(
        `${indent}${c.yellow("GitHub API rate limit hit — try again later or reduce --changelog scope")}`,
      );
      break;
    default:
      out.push(`${indent}${c.dim("(could not fetch release notes)")}`);
  }
  out.push("");
}

function renderVersionsTable(result, c, out) {
  const { all, networkErrors } = result;
  if (!all.length) {
    out.push(c.dim("No external dependencies to check."));
    out.push("");
    return;
  }

  const byName = [...all].sort((a, b) => a.name.localeCompare(b.name));

  out.push(c.bold(`All package versions (${byName.length}):`));
  const nameW = Math.max(...byName.map((r) => r.name.length));
  const curW = Math.max(...byName.map((r) => (r.current || "-").length), 7);

  for (const r of byName) {
    const current = r.current || "-";
    let latestCol;
    let marker;
    let statusLabel;

    switch (r.status) {
      case "major":
        marker = c.red("✗");
        latestCol = c.bold(r.latest);
        statusLabel = c.red("major update available");
        break;
      case "minor":
        marker = c.yellow("⚠");
        latestCol = c.bold(r.latest);
        statusLabel = c.yellow("minor update available");
        break;
      case "patch":
        marker = c.dim("·");
        latestCol = r.latest;
        statusLabel = c.dim("patch update available");
        break;
      case "up-to-date":
        marker = c.green("✓");
        latestCol = r.latest;
        statusLabel = c.green("up to date");
        break;
      case "not-published":
        marker = c.dim("○");
        latestCol = "-";
        statusLabel = c.dim("private / not on public npm");
        break;
      case "error":
        marker = c.dim("?");
        latestCol = "-";
        statusLabel = c.dim(`check failed (${r.error || "unknown error"})`);
        break;
      default:
        marker = c.dim("?");
        latestCol = "-";
        statusLabel = c.dim("could not determine");
    }

    out.push(
      `  ${marker} ${r.name.padEnd(nameW)}  ${current.padEnd(curW)} → ${latestCol.toString().padEnd(14)} ${statusLabel}`,
    );
  }

  if (networkErrors.length) {
    out.push("");
    out.push(
      c.dim(`${networkErrors.length} package(s) failed to check due to network/registry issues.`),
    );
  }
  out.push("");
}

function renderFullMatrix(workspaces, c, out) {
  out.push(c.bold(`Full dependency matrix:`));
  out.push("");
  for (const ws of workspaces) {
    renderWorkspaceDetail(ws, c, out);
  }
}

function renderWorkspaceDetail(ws, c, out) {
  out.push(c.bold(`${ws.name} @ ${ws.version}`) + c.dim(`  (${ws.relPath})`));
  const entries = Object.entries(ws.deps).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    out.push(c.dim("  no dependencies"));
    out.push("");
    return;
  }
  const nameW = Math.max(...entries.map(([n]) => n.length));
  for (const [name, { version, type }] of entries) {
    out.push(`  ${name.padEnd(nameW)}  ${version.padEnd(14)} ${c.dim(`(${type})`)}`);
  }
  out.push("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printHelp();
    return;
  }

  const target = path.resolve(opts.target || process.cwd());

  if (!fs.existsSync(target)) {
    console.error(`Error: path does not exist: ${target}`);
    process.exitCode = 1;
    return;
  }

  const c = makeColorizer(opts.color);
  const stats = { errors: [], skippedGitignored: 0 };
  const startedAt = Date.now();

  const files = findPackageJsonFiles(target, opts, stats);
  const workspaces = files
    .map((f) => loadWorkspace(f, target, stats))
    .filter(Boolean)
    .sort((a, b) =>
      a.isRoot === b.isRoot ? a.relPath.localeCompare(b.relPath) : a.isRoot ? -1 : 1,
    );

  if (!workspaces.length) {
    console.log(`No package.json files found under ${target}`);
    if (stats.errors.length) {
      console.log(`${stats.errors.length} error(s) while scanning — run with --json for detail.`);
    }
    return;
  }

  const depMap = buildDependencyMap(workspaces);
  const conflicts = findConflicts(depMap);
  const hygieneIssues = findHygieneIssues(workspaces);

  let outdatedResult = null;
  if (opts.outdated || opts.versions) {
    outdatedResult = await checkOutdated(depMap, opts.concurrency);
    if (opts.changelog && outdatedResult.outdated.length) {
      await fetchChangelogs(outdatedResult.outdated, opts.changelogLines);
    }
  }

  const elapsedMs = Date.now() - startedAt;

  if (opts.json) {
    const json = JSON.stringify(
      {
        root: target,
        scannedMs: elapsedMs,
        workspaces: workspaces.map(({ absPath, ...rest }) => rest),
        conflicts,
        hygieneIssues,
        outdated: outdatedResult,
        errors: stats.errors,
      },
      null,
      2,
    );
    if (opts.jsonFile) {
      fs.writeFileSync(opts.jsonFile, json, "utf8");
      console.log(`Wrote JSON to ${opts.jsonFile}`);
    } else {
      console.log(json);
    }
    return;
  }

  const out = [];
  out.push(c.bold(`📦 Monorepo Package Audit`) + c.dim(`  —  ${target}`));
  out.push(
    c.dim(`Found ${workspaces.length} package.json file${workspaces.length === 1 ? "" : "s"}`),
  );
  if (stats.skippedGitignored) {
    out.push(c.dim(`(${stats.skippedGitignored} additional path(s) skipped via .gitignore)`));
  }
  out.push("");

  if (opts.workspace) {
    const match = workspaces.find(
      (w) =>
        w.name === opts.workspace ||
        w.relPath === opts.workspace ||
        w.relPath === path.normalize(opts.workspace),
    );
    if (!match) {
      console.log(`No workspace matching "${opts.workspace}" found.`);
      console.log(`Available: ${workspaces.map((w) => w.name).join(", ")}`);
      return;
    }
    renderWorkspaceDetail(match, c, out);
    process.stdout.write(out.join("\n") + "\n");
    return;
  }

  if (opts.full) {
    renderFullMatrix(workspaces, c, out);
  } else if (!opts.onlyConflicts) {
    renderWorkspaceList(workspaces, c, out);
  }

  renderConflicts(conflicts, c, out);
  renderHygiene(hygieneIssues, c, out);
  if (outdatedResult) {
    if (opts.versions) {
      renderVersionsTable(outdatedResult, c, out);
    } else {
      renderOutdated(outdatedResult, c, out, opts.changelog);
    }
  }
  renderTopShared(depMap, opts.top, c, out);

  const totalDepDeclarations = workspaces.reduce((sum, w) => sum + w.depCount, 0);
  const totalUniquePackages = depMap.size;
  const majorCount = conflicts.filter((x) => x.severity === "major").length;
  const rangeCount = conflicts.length - majorCount;

  out.push(c.bold("Summary:"));
  out.push(
    `  ${workspaces.length} package.json file${workspaces.length === 1 ? "" : "s"} scanned` +
      ` (${workspaces.filter((w) => !w.isRoot).length} workspaces${workspaces.some((w) => w.isRoot) ? ", 1 root manifest" : ""})`,
  );
  out.push(
    `  ${totalDepDeclarations.toLocaleString()} total dependency declarations, ${totalUniquePackages.toLocaleString()} unique packages`,
  );
  if (conflicts.length) {
    out.push(
      `  ${conflicts.length} version conflict${conflicts.length === 1 ? "" : "s"} ${c.dim(`(${majorCount} major, ${rangeCount} range)`)}`,
    );
  } else {
    out.push(`  ${c.green("0 version conflicts")}`);
  }
  out.push(
    `  ${hygieneIssues.length ? hygieneIssues.length + " hygiene issue" + (hygieneIssues.length === 1 ? "" : "s") : c.green("0 hygiene issues")}`,
  );
  if (outdatedResult) {
    const majorOutdated = outdatedResult.outdated.filter((o) => o.status === "major").length;
    out.push(
      `  ${outdatedResult.outdated.length} outdated ${c.dim(`(${majorOutdated} major)`)}, ` +
        `${outdatedResult.unpublished.length} not on public npm, ${outdatedResult.networkErrors.length} check failures`,
    );
  }
  if (stats.errors.length) {
    out.push(`  ${c.red(String(stats.errors.length))} file(s) could not be read/parsed:`);
    for (const e of stats.errors.slice(0, 10)) {
      out.push(`    ${c.dim(path.relative(target, e.path))} — ${e.error}`);
    }
  }
  out.push(`  ${c.dim(`done in ${elapsedMs}ms`)}`);

  process.stdout.write(out.join("\n") + "\n");
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exitCode = 1;
});
