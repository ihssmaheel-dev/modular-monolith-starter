# Frontend Architecture — Web, Mobile and Shared Packages

The repository ships two clients (`apps/web` browser + `apps/mobile` Expo native) backed by the modular-monolith API.

## System map

- `apps/web` — TanStack Start, TanStack Router, TanStack Query, Zustand, i18n, and the shared UI system.
- `apps/mobile` — Expo 57, expo-router file-based, NativeWind 4, TanStack Query, Zustand, i18n, mirrored `src/components/ui/*` (same `variant/size` API as `@repo/ui` but RN-native) + `src/theme` tokens.
- `packages/contracts` — Zod schemas, DTOs, oRPC contracts, pagination, and error constants.
- `packages/api-client` — typed oRPC clients (OpenAPI link) used by default, REST compatibility
  fallbacks, and TanStack Query utilities with auth refresh, tenant, locale, CSRF, and idempotency
  headers.
- `packages/i18n` — locale dictionaries and shared locale configuration.
- `packages/ui` — Base UI/shadcn primitives, Tailwind tokens, and composed components (web only).
- `packages/design-tokens` — single source `src/presets/active.json` → `pnpm theme:generate` regenerates web CSS + email TS + mobile RN hex.

## Web — `apps/web`

**Stack:** Vite 8 + TanStack Start 1 + TanStack Router 1 (file-based SSR) + TanStack Query 5 + Zustand 5 + react-i18next + Tailwind 4 + `@repo/ui` + react-hook-form + Zod 4 + date-fns (locale-aware dates via `src/lib/format.ts`).

### Commands

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web start
pnpm --filter web typecheck
```

`start` runs the built SSR handler with the static client bundle on port `3000` (`PORT` can override it).
It is independent of the API process. `VITE_API_URL` is baked into the client bundle at build time — changing it
at runtime does not affect already-built browser assets (only the SSR server process reads runtime env), so set it
correctly before `pnpm --filter web build`.

### Structure

```
apps/web/
  vite.config.ts
  components.json
  src/
    router.tsx
    routeTree.gen.ts       # generated; never hand-edit
    routes/                # thin file-based routes (validateSearch/beforeLoad/loader/errorComponent + one feature)
    components/            # app-level components/providers + RouteErrorFallback
    features/              # per domain: *.queries.ts, *.mutations.ts, components/, hooks/
    stores/                # auth, locale, and tenant state
    hooks/
    lib/                   # env, API client, i18n, query client, query-keys, format
    e2e/                   # Playwright journeys (auth-and-notes, guards)
```

### Invariants

- Routes parse params and compose feature helpers; they do not contain API calls or business rules.
- Forms use Zod schemas imported from `@repo/contracts` through `zodResolver`.
- API access goes through `getApiClient()`; direct `fetch` is prohibited.
- Tenant-scoped query keys include the active tenant ID. Logout and tenant switches clear affected cached data.
- Error displays use stable error codes and i18n keys; raw response bodies and exception text never reach users.
- Authentication prefers httpOnly cookies, with short-lived Bearer tokens as a fallback.
- `VITE_API_URL` is validated in `src/lib/env.ts`.

### Public links and authentication handoff

Public browser destinations are defined once in `@repo/contracts` as
`FRONTEND_ROUTES`. The API uses `buildFrontendUrl` for password-reset, welcome,
and organization-invitation emails, so links remain valid when route structure
changes. The invitation destination is `/accept-invitation`; it validates the
token, asks the recipient to sign in when necessary, and returns to the
invitation after login or registration. Email listener tests assert the emitted
paths and encoded token query values as link smoke tests.

## Design tokens — single-file reskin

One source: `packages/design-tokens/src/presets/active.json` (Zod-validated). Edit one file, run one command:

```bash
pnpm theme:generate # regenerates 3 targets
pnpm theme:check    # CI guard — fails if generated files are stale
```

Generated targets (never hand-edit):

- `packages/ui/src/styles/tokens.generated.css` → web light/dark CSS vars (`:root`/`.dark`, radius, fonts) — imported by `packages/ui/src/styles/globals.css`
- `packages/email/src/styles/tokens.ts` → email light/dark + brand hex (CTA uses brand purple)
- `apps/mobile/src/theme/tokens.generated.ts` + `tailwind.tokens.generated.js` → RN hex + NativeWind `theme.extend.colors` (semantic: `background/foreground/card/primary/muted/border/...`)

Reskin workflow: change `light.primary` or `brand.purple` in `active.json`, run `pnpm theme:generate`, rebuild `web` + `mobile`. No component edits needed. Dark mode (`light|dark|system`) is shared: web via `ThemeProvider` (`localStorage` + `matchMedia` + `d` toggle), mobile via `useThemeStore` (`SecureStore` + `useColorScheme`) + `ThemeProvider` (`dark` class for NativeWind).

## Shared UI

Use primitives from `@repo/ui/components/ui/*` and composed components from `@repo/ui/components/composed/*` on web. On mobile, use mirrored primitives from `apps/mobile/src/components/ui/*` (`Button/Card/Input/Label/Badge/Skeleton/EmptyState/ConfirmDialog/DataTable/Tabs/Sheet/Toast/Text/PageHeader`) — same prop names (`variant/size`) as web, implemented with RN `Pressable/View/TextInput` + `mobileTokens[resolvedTheme]` + Tailwind semantic classes (`bg-background/text-foreground/border-border`). Never import `@repo/ui` in mobile (DOM-only). Add web primitives via `pnpm dlx shadcn@latest add <c> -c apps/web` (lands in `@repo/ui`); add mobile mirrors manually to keep parity.

## Adding a feature (web + mobile)

1. Add or update schemas/contracts in `packages/contracts`.
2. Add the typed API client subclient in `packages/api-client`.
3. Add query/mutation helpers under `apps/web/src/features/[domain]` and mirror under `apps/mobile/src/features/[domain]` (same `queryKeys` shape, tenant-scoped).
4. Add a thin route under `apps/web/src/routes` and mirror screen under `apps/mobile/app`.
5. Use semantic tokens (`bg-background/text-foreground/border-border/text-destructive`) and primitives (`@repo/ui` on web, `apps/mobile/src/components/ui/*` on mobile — never import `@repo/ui` in mobile).
6. Add locale keys to `packages/i18n/src/locales/en.json`, `es.json`, and `fr.json`.
7. Run `pnpm theme:check`, `pnpm rules:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm --filter web build && pnpm --filter mobile build`.

## Visual QA checklist (reskin / theme)

- [ ] Edited only `packages/design-tokens/src/presets/active.json`, ran `pnpm theme:generate`, committed generated files together.
- [ ] Web: light + dark screenshots (Dashboard/Notes/Settings), `d` key toggles, `localStorage theme` persists.
- [ ] Mobile: Settings → Appearance `light/dark/system` screenshots, `useColorScheme` follows system.
- [ ] No `slate-*`/`bg-white`/`@repo/ui` in `apps/mobile` (enforced by `pnpm rules:check`).
- [ ] `pnpm theme:check && pnpm rules:check && pnpm --filter web build && pnpm --filter mobile build` green.

## Storybook (web UI catalog)

`packages/ui` ships a Storybook workshop (Storybook 10 + `@storybook/react-vite`, Tailwind 4 via the repo's own `@tailwindcss/vite` plugin, real `globals.css` + generated tokens, light/dark toggle matching the app's `.dark` variant):

```bash
pnpm --filter @repo/ui storybook         # workshop on http://localhost:6006
pnpm --filter @repo/ui build-storybook   # static export (CI-verified, no paid services)
```

Contributor rules:

- Every component under `packages/ui/src/components/**` has a co-located `*.stories.tsx` (enforced by `pnpm rules:check`; `direction.tsx` is exempt — hook-only re-export, no visual surface).
- Stories use plain English strings, never `t("…")` keys; no `any`, no `console.*`.
- Every `pnpm dlx shadcn@latest add <c> -c apps/web` ships with its story in the same slice.
- Prefer uncontrolled defaults (`defaultOpen`, `defaultValue`, `defaultChecked`) and put required props in story `args` — components with required props (e.g. `ChartContainer.config`) fail typecheck otherwise.
