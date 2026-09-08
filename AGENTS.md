# AGENTS.md

You are working in a modular monolith codebase. Before making any changes, read and follow the rules in `ai_instructions/`.

**ALL RULES ARE MANDATORY. VIOLATIONS ARE PROHIBITED.**

## Required Reading Order

Same order as `ai_instructions/README.md` (the table there is the single source — do not reorder here):

1. `ai_instructions/README.md` — Start here.
2. `ai_instructions/CORE_RULES.md` — Supreme laws. Locked stack. Never/always.
3. `ai_instructions/MODULE_RULES.md` — Backend module structure.
4. `ai_instructions/FILE_PLACEMENT_RULES.md` — Where to create new files. Decision tree + directory map.
5. `ai_instructions/EVENT_AND_ERROR_RULES.md` — Error handling and domain events.
6. `ai_instructions/I18N_RULES.md` — Internationalization. Translations, locale management.
7. `ai_instructions/FRONTEND_RULES.md` — Web (TanStack Start) + mobile (Expo) + UI system.
8. `ai_instructions/CODE_QUALITY_RULES.md` — Small files, clean code, no anti-patterns.
9. `ai_instructions/SECURITY_AND_OPS_RULES.md` — Env vars, security, indexing, logging, git workflow.
10. `ai_instructions/TESTING_RULES.md` — Test contract.
11. `ai_instructions/PACKAGE_POLICY.md` — Before installing any package.
12. `ai_instructions/PERFORMANCE_RULES.md` — DB queries, caching, bundle size.

## Non-Negotiable

- Read these files before every task. Do not skip.
- The stack is locked. Do not add, replace, or suggest alternatives without approval.
- Never throw in application/domain layers. Use neverthrow Result.
- Never import another module's Drizzle table or direct database model.
- Every Zod schema, type, and contract lives in packages/contracts (@repo/contracts).
- **All user-facing text must use i18n.** Translations live in packages/i18n (@repo/i18n).
- **All error messages must use I18nService.** Never hardcode.
- Ask in every PR: "Is this the simplest structure that could work?"
- Keep files small and single-responsibility. Limits per area live in `ai_instructions/CODE_QUALITY_RULES.md` (app code 400 lines, web routes 150, web lib 250, stores 200, tests 800) — that table is the single source, not this list.
- Functions under 30 lines. No deep nesting.
- No magic numbers, no copy-paste, no `any`, no `console.log`.
- **Every new file must land in the correct location on first creation.** See `FILE_PLACEMENT_RULES.md`.

## Violation Enforcement

- Every rule in `ai_instructions/` is **mandatory**.
- Code that violates rules will be **rejected**.
- When uncertain, consult the relevant rule file before proceeding.
- All error messages must go through `I18nService` with proper locale keys.

Skills provide specialized instructions and workflows for specific tasks.
Use the skill tool to load a skill when a task matches its description.
<available_skills>
  <skill>
    <name>customize-opencode</name>
    <description>Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself.</description>
    <location>&lt;built-in&gt;</location>
  </skill>
</available_skills>
