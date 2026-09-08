# Package Policy

Rules for adding any dependency to this codebase.

---

## Before Installing Anything

Ask these questions in order:

1. **Does a solution already exist in our stack?** Check `@repo/contracts`, `@repo/authorization`, `@repo/i18n`, `@repo/api-client`, and existing modules.
2. **Can we solve this with <20 lines of our own code?** If yes, write it yourself.
3. **Is this package on our locked stack?** Check `CORE_RULES.md` locked stack table.
4. **Is this package 100% free and open source?** No paid tiers, no "community edition" bait-and-switch.
5. **Does this package have an active maintainer and recent releases?** Check npm downloads, last publish date, open issues.
6. **What is the bundle size impact?** Check bundlephobia.com for client packages.

---

## Approval Flow

| Risk Level | Example | Approval |
|------------|---------|----------|
| Low | Dev tool (linter, formatter, types) | Auto-approve, add to `devDependencies` |
| Medium | Utility library (date-fns, lodash-es) | Justify in PR, document why existing tools are insufficient |
| High | Framework-level addition (new state manager, new ORM) | Architecture review required. Must prove existing stack cannot solve the problem. |

---

## Rules

1. **No paid core dependencies.** Free tier is acceptable only if the free tier is permanent and sufficient.
2. **No "just in case" dependencies.** Install only when you are about to use it.
3. **No duplicate functionality.** If we already have a solution, use it.
4. **No global state managers beyond Zustand.** If you think you need Redux, MobX, or Jotai, justify why Zustand is insufficient.
5. **No UI component libraries beyond shadcn/ui + Base UI.** No MUI, no Ant Design, no Chakra. Extend shadcn/ui if needed. `react-email` is allowed exclusively in `packages/email`.
6. **No CSS frameworks beyond Tailwind 4 + @tailwindcss/vite.** No CSS Modules, no Styled Components, no Emotion.
7. **No ORMs beyond Drizzle.** No Prisma, no TypeORM, no alternative ORMs or ODM drivers.
8. **No test frameworks beyond Vitest (api + web + mobile logic) + Playwright (web E2E).** No Jest, no Mocha, no Jasmine. Mobile component tests stay deferred pending architecture review.
9. **Locked frontend data stack:** TanStack Router + TanStack Start + TanStack Query only. No React Router, no Next.js, no Remix, no SWR beyond TanStack Query. Forms via `react-hook-form` + `@hookform/resolvers/zod` only.
10. **Locked i18n stack:** `react-i18next` + `i18next-browser-languagedetector` (web). No next-intl, no FormatJS.
11. **Icons:** `lucide-react`, no other icon packs without justification.

---

## Adding a Package

1. Check the locked stack in `CORE_RULES.md`.
2. Run: `pnpm add <package>` (or `pnpm add -D <package>` for dev deps).
3. If the package needs configuration, add it to the appropriate config file.
4. Run `pnpm audit` to check for known vulnerabilities.
5. Document the addition in the PR description with a one-line justification.

---

## Removing a Package

1. Search the codebase for all imports of the package.
2. Replace all usages with alternatives from our existing stack or inline code.
3. Remove from `package.json`.
4. Run `pnpm install` to clean the lockfile.

---

## Red Flags

Reject packages that:
- Have not been updated in 12+ months
- Have more open issues than closed issues
- Require a paid plan for basic features
- Duplicate functionality already in our stack
- Pull in large transitive dependency trees
- Use `eval()` or dynamic code generation
- Have known security vulnerabilities (check `pnpm audit`)
- Exceed 50kB minified for utility libraries
