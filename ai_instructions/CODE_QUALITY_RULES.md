# Code Quality Rules

Keep files small, clean, and maintainable. Every file should be easy to understand in isolation.

---

## File Size Limits (Relaxed for Real-World, Single-Responsibility First)

| File Type / Location | Max Lines | Action if Exceeded |
|----------------------|-----------|-------------------|
| App code: `apps/*`, `packages/contracts`, `packages/authorization`, `packages/i18n`, `packages/api-client`, `packages/ui` lib/hooks | **400** | Split by responsibility if file does 2 jobs or is hard to scan in 3 minutes |
| Backend Command / Query / Controller / Service | **400** | Extract helper; keep one use-case per file |
| Frontend Route / Page `apps/web/src/routes/*` | **150** | Split into `features/*` components if route mixes data + UI + form logic |
| Feature Component / Hook / Utility `apps/web/src/features/*`, `apps/web/src/lib/*`, `apps/web/src/hooks/*` | **400** | Extract sub-component/hook |
| Web lib `apps/web/src/lib/*` | **250** | Extract helper module |
| Store `apps/web/src/stores/*`, `packages/*` stores | **200** | Split slices |
| UI Primitive `packages/ui/src/components/ui/*` | **800** | One shadcn family per file; large families like `sidebar` are fine. Split only if mixing 2 families |
| Composed Component `packages/ui/src/components/composed/*` (DataTable, PageHeader, etc) | **400** | One reusable composed component per file (composes 3-6 primitives) |
| Email Template `packages/email/src/*` | **400** | One template per file |
| Test file `*.test.ts`, `*.spec.ts`, `*.e2e.ts` | **800** | Split by describe block or scenario |

**How we count:** `source.trimEnd().split(/\r?\n/).length` — trailing final newline is not counted.  
**The rule is single-responsibility, not line-count.** Caps are backstops with ~2x headroom over today's largest files — they should never nag during normal work. If a file does one thing well, even 350 lines is fine. If it does two jobs, split regardless of count. This table is the single source for all limits; other rule files point here instead of restating numbers.

---

## Coding Principles

### Single Responsibility
- One file = one responsibility.
- One function = one job.
- If you can't describe what a file does in one sentence, split it.

### Small Functions
- Functions should be 5–25 lines.
- If a function exceeds 60 lines, extract helpers.
- Early returns over nested conditionals.

```typescript
// Good
function processOrder(order: Order): Result<Order, OrderError> {
  if (!order.items.length) {
    return err({ type: "EMPTY_ORDER" });
  }

  if (order.total > 10000) {
    return err({ type: "ORDER_TOO_LARGE" });
  }

  const processed = calculateDiscount(order);
  return ok(processed);
}

// Bad
function processOrder(order: Order): Result<Order, OrderError> {
  if (order) {
    if (order.items) {
      if (order.items.length > 0) {
        if (order.total <= 10000) {
          // ... 50 more lines of nested logic
        } else {
          return err({ type: "ORDER_TOO_LARGE" });
        }
      } else {
        return err({ type: "EMPTY_ORDER" });
      }
    }
  }
}
```

### Extract Don't Duplicate
- If you copy-paste more than 3 lines, extract a function.
- If two components share logic, extract a hook or utility.
- Shared code goes in capability packages (`@repo/contracts`, `@repo/authorization`, `@repo/i18n`, `@repo/design-tokens`) or the nearest `lib/` or `utils/` folder.

### Naming
- Functions: `verbNoun` — `createUser`, `validateEmail`, `fetchOrders`.
- Booleans: `is`, `has`, `can`, `should` — `isLoading`, `hasPermission`, `canEdit`.
- Components: `Noun` — `UserProfile`, `OrderCard`, `PaymentForm`.
- Events: `past-tense noun` — `UserCreated`, `OrderPlaced`.
- Kebab-case everywhere: `create-user.command.ts`, `users.controller.ts`, `welcome-email.listener.ts`.
- Suffixes: `.controller.ts`, `.command.ts`, `.query.ts`, `.repository.ts`, `.entity.ts`.
- Files: match the export name — `create-user.command.ts` exports `CreateUserCommand`.

### No Magic
- No magic numbers. Use named constants.
- No nested ternaries.
- No more than 3 levels of nesting.
- No `else` when `if` returns.

```typescript
// Bad
const discount = user.isPremium ? order.total * 0.2 : order.total > 500 ? order.total * 0.1 : 0;

// Good
function calculateDiscount(order: Order, isPremium: boolean): number {
  if (isPremium) return order.total * 0.2;
  if (order.total > 500) return order.total * 0.1;
  return 0;
}
```

---

## Async/Await Patterns

### Parallel Operations
Use `Promise.all()` for independent async operations:

```typescript
// Bad — sequential (slow)
const user = await this.userRepository.findById(id);
const orders = await this.orderRepository.findByUserId(id);
const notifications = await this.notifRepository.findByUserId(id);

// Good — parallel (fast)
const [user, orders, notifications] = await Promise.all([
  this.userRepository.findById(id),
  this.orderRepository.findByUserId(id),
  this.notifRepository.findByUserId(id),
]);
```

### Sequential Dependencies
Only use sequential awaits when later operations depend on earlier results:

```typescript
const user = await this.userRepository.findById(id);    // need user.id
const orders = await this.orderRepository.findByUserId(user.id); // depends on user
```

### Error Handling
Don't swallow errors silently:

```typescript
// Bad
try {
  await riskyOperation();
} catch (e) {
  // silently ignored
}

// Good
try {
  await riskyOperation();
} catch (e) {
  logger.error({ err: e }, "Risky operation failed");
  throw e;
}
```

---

## Memory Leak Prevention

### Event Listeners
Always clean up event listeners:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => { /* ... */ };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

### Abort Controllers
Cancel in-flight requests when components unmount:

```typescript
useEffect(() => {
  const controller = new AbortController();

  fetchData({ signal: controller.signal })
    .then(setData)
    .catch((e) => {
      if (e.name !== "AbortError") throw e;
    });

  return () => controller.abort();
}, []);
```

### Timers
Clean up intervals and timeouts:

```typescript
useEffect(() => {
  const interval = setInterval(poll, 5000);
  return () => clearInterval(interval);
}, []);
```

---

## File Organization

### Imports
- Group imports: external → internal → types.
- One blank line between groups.
- No unused imports.
- No relative imports outside the module boundary.

```typescript
// Good
import { Result, ok, err } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { UserRepository } from "../infrastructure/users.repository";
import { User } from "../domain/entities/user";
import { CreateUserInput, UserError } from "../types";
```

### Exports
- One default export per file OR only named exports. Be consistent.
- Prefer named exports — they're easier to refactor.
- Export at the bottom of the file.

### Constants
- Domain constants live in `packages/contracts/src/constants/`.
- Module-level constants live at the top of the file.
- No hardcoded strings in business logic.

---

## Anti-Patterns to Avoid

| Anti-Pattern | Instead Do |
|-------------|------------|
| God file (500+ lines) | Split by responsibility |
| God function (100+ lines) | Extract helpers, one job per function |
| Deep nesting (4+ levels) | Early returns, extract conditions |
| Copy-paste code | Extract shared function |
| Magic numbers | Named constants |
| Stringly-typed values | Enums or union types |
| `any` type | `unknown` + type guard |
| Barrel exports re-exporting everything | Export only what's needed |
| Comments explaining "what" | Rename to explain "why" |
| Empty catch blocks | Log or rethrow, never swallow |
| Sequential awaits for independent ops | `Promise.all()` |
| Event listeners without cleanup | Return cleanup function |
| Hardcoded user-facing strings | Use i18n translation keys |
| Hardcoded error messages | Use `I18nService.t()` |

---

## The Test

Before submitting a file, ask:

1. Can I understand this file in under 2 minutes and describe its single responsibility in one sentence?
2. Does this file do one thing well? (if two, split regardless of line count)
3. Are all functions under 60 lines (helpers extracted beyond that)?
4. Is there any duplication I can extract?
5. Would a new developer understand this without comments?
6. Does this file belong where I'm putting it?
7. Are all user-facing strings using i18n keys?
8. Are all error messages using `I18nService` / `useTranslation`?

If the answer to any is no — refactor before committing.
