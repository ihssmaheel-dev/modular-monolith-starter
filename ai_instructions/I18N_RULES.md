# Internationalization (i18n) Rules

Rules for multi-language support across backend and frontend.

---

## Single Source of Truth

All translations live in `packages/i18n/src/locales/`. One JSON file per language.

```
packages/i18n/src/
├── locales/
│   ├── en.json    ← English (default)
│   ├── es.json    ← Spanish
│   └── fr.json    ← French
└── index.ts       ← Exports locales, DEFAULT_LOCALE, SUPPORTED_LOCALES
```

**Never** hardcode translations in service files, components, or anywhere else.

---

## Backend Rules (`apps/api`)

### I18n Service

- Use `I18nService` from `infrastructure/i18n/` for all translations.
- Translation keys use dot notation: `api.error.notFound`, `user.created`.
- Support variable interpolation: `t("dashboard.welcome", lang, { name: "Alice" })` → `"Welcome, Alice!"`.
- Always pass `Accept-Language` header from controllers to the service.

### Exception Filter

- All HTTP error messages **must** go through `I18nService`.
- Error keys follow the pattern: `api.error.{errorType}`.
- Never hardcode error messages in controllers or filters.

### Controller Pattern

```typescript
// Good
@Post()
async create(@Body() body: any) {
  const result = await this.createUserCommand.execute(body);

  if (result.isErr()) {
    const message = this.i18n.t("api.user.emailTaken", acceptLanguage);
    return { status: 409, body: { message } };
  }
  
  return { status: 201, body: result.value };
}

// Bad — hardcoded message
return { status: 409, body: { message: "Email already taken" } };
```

---

## Frontend Rules (`apps/web` + `apps/mobile`)

### Web (`apps/web` — TanStack Start)

- Use `react-i18next` + `i18next-browser-languagedetector` for all user-facing text. Resources imported from `@repo/i18n` locales.
- Init in `apps/web/src/lib/i18n.tsx`: `i18n.use(LanguageDetector).use(initReactI18next).init({ resources: { en: { translation: locales.en }, es, fr }, fallbackLng: 'en' })`. Wrap app in `I18nProvider` from `routes/__root.tsx`.
- Store user language preference in Zustand `useLocaleStore` (persist localStorage) + `localStorage` + `i18next-browser-languagedetector` caches `localStorage`.
- Auto-detect browser language on first visit via detector order `['localStorage','navigator','htmlTag']`.
- `getApiClient()` reads `getLocale()` from `useLocaleStore` and sends `accept-language`; backend `I18nService.t(key, lang, params)` respects it.
- Never hardcode strings in components.

```tsx
// Good — web
import { useTranslation } from "react-i18next";

function Dashboard() {
  const { t } = useTranslation();
  return <h1>{t("dashboard.title")}</h1>;
}

// Bad
return <h1>Dashboard</h1>;
```

### Mobile (`apps/mobile` — Expo)

- Same `react-i18next` + shared `@repo/i18n` resources, initialized in `apps/mobile/src/lib/i18n.ts`.
- No browser detector: the device locale comes from `expo-localization` (`deviceLocale()`), and the persisted `useLocaleStore` choice wins after rehydrate.
- Dynamic keys are banned by `pnpm rules:check` — use explicit key maps (e.g. `STATUS_LABELS`), never `` t(`files.status.${status}`) ``.

---

## Translation Key Structure

```json
{
  "common": { "loading": "...", "error": "...", "retry": "...", "save": "...", "cancel": "..." },
  "auth": { "login": "...", "register": "...", "logout": "...", "email": "...", "password": "..." },
  "dashboard": { "title": "...", "welcome": "...", "stats": "..." },
  "users": { "title": "...", "list": "...", "create": "...", "edit": "...", "delete": "..." },
  "notes": { "title": "...", "createNote": "...", "deleteConfirm": "..." },
  "files": { "dropFiles": "...", "uploading": "...", "attachments": "..." },
  "privacy": { "title": "...", "exportTitle": "...", "eraseAccount": "..." },
  "notifications": { "title": "...", "markAllRead": "...", "preferencesTitle": "..." },
  "tenancy": { "activeOrganization": "...", "createOrganization": "..." },
  "settings": { "title": "...", "language": "...", "theme": "..." },
  "errors": { "notFound": "...", "unauthorized": "...", "forbidden": "...", "serverError": "..." },
  "zod": { "errors": { "invalid_type": "...", "too_small": "..." } },
  "api": {
    "error": { "internal": "...", "notFound": "...", "unauthorized": "...", "badRequest": "...", "conflict": "..." },
    "user": { "created": "...", "updated": "...", "deleted": "...", "notFound": "...", "emailTaken": "..." },
    "note": { "created": "...", "notFound": "..." },
    "tenancy": { "slugTaken": "...", "lastOwner": "..." },
    "privacy": { "exportFailed": "...", "erasureFailed": "..." },
    "notifications": { "sendFailed": "...", "notFound": "..." }
  }
}
```

### Naming Convention

- `common.*` — Universal UI text
- `auth.*` — Authentication flows
- `dashboard.*` — Dashboard screens
- `users.*` — User management
- `notes.*` — Notes screens
- `files.*` — File upload + attachment UI
- `privacy.*` — GDPR export/erasure screens
- `notifications.*` — Center, preferences, device UI (titles render from `titleKey`)
- `tenancy.*` — Organization screens
- `settings.*` — Settings screens
- `errors.*` — User-facing error pages
- `zod.*` — Shared validation messages
- `api.error.*` — Backend API error messages
- `api.user.*`, `api.note.*`, `api.tenancy.*`, `api.privacy.*`, `api.notifications.*`, `api.file.*` — Domain API messages

---

## Adding a New Language

1. Create `packages/i18n/src/locales/{locale}.json`.
2. Copy structure from `en.json`.
3. Translate all values (not keys).
4. Add locale to `SUPPORTED_LOCALES` in `packages/i18n/src/index.ts`.
5. Add locale to `resources` in `apps/web/src/lib/i18n.tsx` and to `resources` + `SUPPORTED` in `apps/mobile/src/lib/i18n.ts`.
6. Run `pnpm rules:check` — locale parity across all files is enforced.

---

## Adding a New Translation Key

1. Add key to `en.json` first.
2. Add same key to all other locale files (use English as placeholder if needed).
3. Use the key in code via `I18nService.t()` (backend) or `useTranslation().t()` (frontend).

---

## Anti-Patterns

| Violation | Correct Approach |
|-----------|------------------|
| Hardcoded string in component | Use `t("key")` |
| Hardcoded error in controller | Use `I18nService.t("api.error.*")` |
| Translations in command/query file | Use files in `packages/i18n` |
| Missing locale file | Add to all supported locales |
| Console.log for debugging | Use logger, never expose to users |
| Translation key typo | Keys are type-checked via TypeScript |
