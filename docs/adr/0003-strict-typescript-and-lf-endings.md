# 0003. Strict TypeScript and enforced LF endings

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from strict tsconfigs (`noUncheckedIndexedAccess` bites in review), `.prettierrc` (`endOfLine: lf`), and the CRLF incident below.

## Context

Loose types push bugs to runtime; mixed line endings push noise into every diff and turn `format:check` red nondeterministically depending on which OS checked files out.

## Decision

Strictest practical TypeScript everywhere (strict mode plus index-access strictness, so `possibly undefined` is a compile error, not a production `TypeError`). Line endings pinned once: `.prettierrc` demands LF, `.gitattributes` enforces `text=auto eol=lf` on every OS — added the day the format gate went red on untouched files with zero content changes.

## Consequences

Gain: whole bug classes become build errors; diffs contain only real changes on every platform. Pay: stricter code takes longer to satisfy (indexing, exact optional shapes), and the attributes file must never be deleted casually.

## Alternatives considered

- Lenient `tsconfig` with lint-only discipline: rejected, discipline without compiler backing decays.
- Per-OS `.gitattributes` exceptions or CRLF tolerance: rejected, reintroduces the exact nondeterminism that burned us.
