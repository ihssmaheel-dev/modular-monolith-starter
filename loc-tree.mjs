#!/usr/bin/env node
/**
 * loc-tree.mjs — fast, accurate lines-of-code tree for a directory.
 *
 * Usage:
 *   node loc-tree.mjs [dir] [options]
 *
 * Options:
 *   --json[=file]        Emit JSON (to stdout, or to `file` if given) instead of the tree
 *   --max-depth=N        Only descend N levels deep in the printed tree
 *   --top=N              Show the N largest files by line count (default 10)
 *   --sort=lines|name    Sort order within a directory (default: lines)
 *   --ignore-dir=a,b     Extra directory names to skip (merged with defaults)
 *   --ignore-ext=.a,.b   Extra extensions to skip (merged with defaults)
 *   --follow-symlinks    Follow symlinked directories (cycle-safe)
 *   --no-color           Disable ANSI colors
 *   -h, --help           Show this help
 *
 * Example:
 *   node loc-tree.mjs ./apps/api --top=15 --max-depth=4
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

const DEFAULT_IGNORE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".svg",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".rar",
  ".mp4",
  ".mp3",
  ".mov",
  ".wav",
  ".avi",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".lock",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".sqlite",
  ".db",
]);

const DEFAULT_IGNORE_FILENAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".DS_Store",
  "Thumbs.db",
]);

// Bytes sniffed to decide "is this file binary?" before trying to count lines.
const BINARY_SNIFF_BYTES = 8000;

// ---------------------------------------------------------------------------
// CLI argument parsing (zero dependencies)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    target: null,
    json: false,
    jsonFile: null,
    maxDepth: Infinity,
    top: 10,
    sort: "lines",
    ignoreDirs: new Set(DEFAULT_IGNORE_DIRS),
    ignoreExts: new Set(DEFAULT_IGNORE_EXTENSIONS),
    followSymlinks: false,
    color: process.stdout.isTTY && !("NO_COLOR" in process.env),
    help: false,
  };

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "--no-color") {
      opts.color = false;
    } else if (arg === "--follow-symlinks") {
      opts.followSymlinks = true;
    } else if (arg.startsWith("--max-depth=")) {
      const n = Number(arg.split("=")[1]);
      opts.maxDepth = Number.isFinite(n) && n >= 0 ? n : Infinity;
    } else if (arg.startsWith("--top=")) {
      const n = Number(arg.split("=")[1]);
      opts.top = Number.isFinite(n) && n >= 0 ? n : 10;
    } else if (arg.startsWith("--sort=")) {
      opts.sort = arg.split("=")[1] === "name" ? "name" : "lines";
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
    } else if (arg.startsWith("--ignore-ext=")) {
      arg
        .split("=")[1]
        .split(",")
        .forEach((e) => e && opts.ignoreExts.add(e.startsWith(".") ? e : `.${e}`));
    } else if (!arg.startsWith("-")) {
      opts.target = arg;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`loc-tree — lines-of-code tree for a directory

Usage:
  node loc-tree.mjs [dir] [options]

Options:
  --json[=file]        Emit JSON (stdout, or to file if given)
  --max-depth=N        Only print N levels deep
  --top=N              Show N largest files (default 10)
  --sort=lines|name    Sort order (default lines)
  --ignore-dir=a,b     Extra directory names to skip
  --ignore-ext=.a,.b   Extra extensions to skip
  --follow-symlinks    Follow symlinked directories (cycle-safe)
  --no-color           Disable ANSI colors
  -h, --help           Show this help`);
}

// ---------------------------------------------------------------------------
// Colors (no dependency — plain ANSI, disabled automatically when piped)
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
  };
}

// ---------------------------------------------------------------------------
// File reading / line counting
// ---------------------------------------------------------------------------

/** Returns { lines, binary, error } without ever throwing. */
function analyzeFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;

    if (size === 0) return { lines: 0, binary: false, error: null };

    // Sniff the first chunk for null bytes to detect binaries that slipped
    // past the extension filter (no extension, mislabeled, etc).
    const sniffLen = Math.min(BINARY_SNIFF_BYTES, size);
    const sniffBuf = Buffer.alloc(sniffLen);
    fs.readSync(fd, sniffBuf, 0, sniffLen, 0);
    if (sniffBuf.includes(0)) {
      return { lines: 0, binary: true, error: null };
    }

    const content = fs.readFileSync(filePath, "utf8");
    if (!content.trim()) return { lines: 0, binary: false, error: null };

    // Count newlines rather than split() to avoid allocating a huge array
    // for very large files.
    let lines = 1;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) lines++;
    }
    return { lines, binary: false, error: null };
  } catch (err) {
    return { lines: 0, binary: false, error: err.code || err.message };
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed / nothing to do */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function buildTree(dir, opts, stats, visitedRealPaths = new Set()) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    stats.errors.push({ path: dir, error: err.code || err.message });
    return {
      name: path.basename(dir),
      type: "directory",
      lines: 0,
      children: [],
      unreadable: true,
    };
  }

  const children = [];
  let totalLines = 0;

  for (const entry of entries) {
    const name = entry.name;
    const full = path.join(dir, name);

    let isDir = entry.isDirectory();
    let isSymlink = entry.isSymbolicLink();

    if (isSymlink) {
      if (!opts.followSymlinks) {
        stats.skipped.symlinks++;
        continue;
      }
      let real;
      try {
        real = fs.realpathSync(full);
      } catch {
        stats.skipped.symlinks++;
        continue;
      }
      if (visitedRealPaths.has(real)) {
        stats.skipped.symlinkCycles++;
        continue; // cycle guard
      }
      visitedRealPaths.add(real);
      try {
        isDir = fs.statSync(real).isDirectory();
      } catch {
        continue;
      }
    }

    if (isDir) {
      if (opts.ignoreDirs.has(name)) {
        stats.skipped.dirs++;
        continue;
      }
      stats.dirCount++;
      const child = buildTree(full, opts, stats, visitedRealPaths);
      children.push(child);
      totalLines += child.lines;
      continue;
    }

    // File
    if (DEFAULT_IGNORE_FILENAMES.has(name)) {
      stats.skipped.files++;
      continue;
    }
    if (opts.ignoreExts.has(path.extname(name).toLowerCase())) {
      stats.skipped.files++;
      continue;
    }

    const { lines, binary, error } = analyzeFile(full);

    if (error) {
      stats.errors.push({ path: full, error });
      continue;
    }
    if (binary) {
      stats.skipped.binary++;
      continue;
    }

    stats.fileCount++;
    totalLines += lines;
    const fileNode = { name, type: "file", lines, path: full };
    children.push(fileNode);
    stats.allFiles.push(fileNode);
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    if (opts.sort === "name") return a.name.localeCompare(b.name);
    return b.lines - a.lines;
  });

  return {
    name: path.basename(dir) || dir,
    type: "directory",
    lines: totalLines,
    children,
  };
}

// ---------------------------------------------------------------------------
// Tree rendering — builds one string buffer, single write (fast on big trees)
// ---------------------------------------------------------------------------

// Recursive renderer: directories and files at every depth share identical
// branch-drawing logic, so indentation can never drift out of alignment.
// share identical branch-drawing logic at every level.
function renderChild(node, isLast, prefix, opts, c, depth, out) {
  const branch = isLast ? "└── " : "├── ";
  const nextPrefix = prefix + (isLast ? "    " : "│   ");
  const linePrefix = prefix + branch;

  if (node.type === "directory") {
    const label = node.unreadable
      ? `${c.red(node.name)} ${c.dim("(unreadable)")}`
      : `${c.bold(node.name)} ${c.dim(`(${node.lines.toLocaleString()} LOC)`)}`;
    out.push(`${linePrefix}📁 ${label}`);

    if (depth + 1 >= opts.maxDepth) {
      if (node.children && node.children.length) {
        out.push(`${nextPrefix}${c.dim("… (max depth reached)")}`);
      }
      return;
    }
    (node.children || []).forEach((child, i) => {
      renderChild(child, i === node.children.length - 1, nextPrefix, opts, c, depth + 1, out);
    });
  } else {
    out.push(`${linePrefix}📄 ${node.name} ${c.dim(`(${node.lines.toLocaleString()} LOC)`)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
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
  const stats = {
    dirCount: 0,
    fileCount: 0,
    skipped: { dirs: 0, files: 0, binary: 0, symlinks: 0, symlinkCycles: 0 },
    errors: [],
    allFiles: [],
  };

  const startedAt = Date.now();
  const targetStat = fs.statSync(target);

  const tree = targetStat.isFile()
    ? (() => {
        const { lines, binary, error } = analyzeFile(target);
        if (error) {
          console.error(`Error reading file: ${error}`);
          process.exitCode = 1;
          return null;
        }
        return { name: path.basename(target), type: "file", lines: binary ? 0 : lines };
      })()
    : buildTree(target, opts, stats);

  if (!tree) return;

  const elapsedMs = Date.now() - startedAt;

  if (opts.json) {
    const json = JSON.stringify(tree, null, 2);
    if (opts.jsonFile) {
      fs.writeFileSync(opts.jsonFile, json, "utf8");
      console.log(`Wrote JSON to ${opts.jsonFile}`);
    } else {
      console.log(json);
    }
    return;
  }

  // --- Render tree ---
  const rootLabel = `${c.bold(tree.name)} ${c.dim(`(${tree.lines.toLocaleString()} LOC)`)}`;
  const lines = [`${tree.type === "directory" ? "📁" : "📄"} ${rootLabel}`];

  if (tree.children) {
    tree.children.forEach((child, i) => {
      renderChild(child, i === tree.children.length - 1, "", opts, c, 0, lines);
    });
  }

  process.stdout.write(lines.join("\n") + "\n\n");

  // --- Top N largest files ---
  if (opts.top > 0 && stats.allFiles.length) {
    const top = [...stats.allFiles].sort((a, b) => b.lines - a.lines).slice(0, opts.top);
    console.log(c.bold(`Top ${top.length} largest files:`));
    const maxLoc = String(top[0].lines).length;
    for (const f of top) {
      const rel = path.relative(target, f.path);
      console.log(`  ${c.yellow(String(f.lines).padStart(maxLoc))} LOC  ${rel}`);
    }
    console.log("");
  }

  // --- Summary ---
  const skippedTotal =
    stats.skipped.dirs +
    stats.skipped.files +
    stats.skipped.binary +
    stats.skipped.symlinks +
    stats.skipped.symlinkCycles;

  console.log(c.bold("Summary:"));
  console.log(`  ${c.green(tree.lines.toLocaleString())} total lines`);
  console.log(
    `  ${stats.fileCount.toLocaleString()} files, ${stats.dirCount.toLocaleString()} directories scanned`,
  );
  if (skippedTotal) {
    console.log(
      `  ${skippedTotal.toLocaleString()} skipped ` +
        c.dim(
          `(${stats.skipped.dirs} ignored dirs, ${stats.skipped.files} ignored files, ` +
            `${stats.skipped.binary} binary, ${stats.skipped.symlinks} symlinks, ${stats.skipped.symlinkCycles} symlink cycles)`,
        ),
    );
  }
  if (stats.errors.length) {
    console.log(`  ${c.red(String(stats.errors.length))} unreadable (permission/IO errors)`);
    for (const e of stats.errors.slice(0, 10)) {
      console.log(`    ${c.dim(e.path)} — ${e.error}`);
    }
    if (stats.errors.length > 10) {
      console.log(`    ${c.dim(`… and ${stats.errors.length - 10} more`)}`);
    }
  }
  console.log(`  ${c.dim(`done in ${elapsedMs}ms`)}`);
}

main();
