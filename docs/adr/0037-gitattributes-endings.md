# 0037. Line endings pinned by `.gitattributes`, not by OS luck

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — written the day the format gate went red on untouched files with zero content changes.

## Context

With no attributes file, checkouts follow each machine's git config: Windows machines materialize CRLF, Prettier demands LF, and `format:check` goes red or green depending on who checked out — nondeterministic quality gates erode trust in all gates.

## Decision

`.gitattributes` pins `text=auto eol=lf` repo-wide: blobs stay LF, checkouts stay LF on every OS, overriding local `autocrlf`. Worktree bytes were normalized once; status stayed byte-clean throughout.

## Consequences

Gain: format results identical on Windows, macOS, and Linux forever; diffs contain only real changes. Pay: one more dotfile to never delete, and editors must respect it (all mainstream ones do).

## Alternatives considered

- CRLF tolerance in Prettier: rejected, just moves the nondeterminism into every diff instead.
- Per-OS instructions in onboarding docs: rejected, unenforceable and forgotten by the second hire.
