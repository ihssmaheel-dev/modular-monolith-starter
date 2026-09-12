# Event and Error Rules

Domain events mechanism and neverthrow Result pattern. Both are mandatory.

---

## Error Handling — neverthrow Result Pattern

We use `neverthrow` (`Result<T, E>` / `ResultAsync<T, E>`). No exceptions for expected failures.

### Rules

1. **Application and domain layers** return `Result` or `ResultAsync`.
2. **Controllers / presentation layer** translate `Result` into HTTP responses.
3. **Never throw** for expected domain or application failures.
4. **Throw only** for truly exceptional situations:
   - Programmer errors (null access, invalid state)
   - Unrecoverable infrastructure failures (database connection lost, disk full)
   - Anything that should never happen in correct code
5. **Partial adoption is forbidden.** This is the standard everywhere.

### Result Shape

Define domain errors as a union or enum:

```typescript
// modules/users/domain/errors/user.errors.ts
export type UserNotFound = { type: "USER_NOT_FOUND"; userId: string };
export type EmailTaken = { type: "EMAIL_TAKEN"; email: string };
export type InvalidUserData = { type: "INVALID_USER_DATA"; field: string; reason: string };

export type UserError = UserNotFound | EmailTaken | InvalidUserData;
```

### Application Layer

```typescript
// modules/users/application/commands/create-user.command.ts
import { ok, err, Result } from "neverthrow";
import { UserError } from "../../domain/errors/user.errors";

@Injectable()
export class CreateUserCommand {
  async execute(body: any): Promise<Result<User, UserError>> {
    const existingUser = await this.repo.findByEmail(body.email);
    if (existingUser) {
      return err({ type: "EMAIL_TAKEN", email: body.email }); // Strongly typed, explicit
    }
    // ...
    return ok(newUser);
  }
}
```

### Controller Layer

```typescript
// modules/users/presentation/controllers/users.controller.ts
// constructor(private readonly createUserCommand: CreateUserCommand) {}

  // Nest handler — uses @Post(), @Body() validated via Zod / oRPC
  async create(body: any) {
    const result = await this.createUserCommand.execute(body);

    if (result.isErr()) {
      // TypeScript knows result.error is UserError
      switch (result.error.type) {
        case "EMAIL_TAKEN":
          return { status: 409, body: { message: "Email is already taken" } };
        case "INVALID_USER_DATA":
          return { status: 400, body: { message: result.error.reason } };
        default:
          return { status: 500, body: { message: "Internal error" } };
      }
    }

    return { status: 201, body: result.value };
  }
```

### Error Mapping

| Error Category | HTTP Status | Example |
|----------------|-------------|---------|
| Validation / bad input | 400 | `INVALID_USER_DATA` |
| Not found | 404 | `USER_NOT_FOUND` |
| Conflict | 409 | `EMAIL_TAKEN` |
| Unauthorized | 401 | `UNAUTHORIZED` |
| Forbidden | 403 | `FORBIDDEN` |
| Infrastructure failure | 500 | Never expose internals to client |

### Error Serialization

Domain errors stay internal. Controllers translate them to safe HTTP responses:

```typescript
// Good — safe for client
return { status: 404, body: { message: "User not found" } };

// Bad — leaks internal details
return { status: 404, body: { message: `User ${id} not found in database table users` } };
```

Never expose:
- Database collection names
- Internal IDs (unless the API contract defines it)
- Stack traces
- File paths
- Query details

---

## Repository Layer — When to Return Result

Repositories should return `Result` for operations that can fail meaningfully:

| Operation | Return Type | Reasoning |
|-----------|-------------|-----------|
| `findById(id)` | `Result<User \| null, UserNotFound>` | ID lookup can meaningfully fail |
| `findByEmail(email)` | `Result<User \| null, never>` | Lookup by unique field — null is valid, no error type needed |
| `findAll(options)` | `Result<{ users, total }, never>` | Query success/failure is infrastructure, not domain |
| `save(user)` | `Result<User, never>` | Save either succeeds or throws (infra failure) |
| `update(user)` | `Result<User, UserNotFound>` | Update can fail if record was deleted |
| `delete(id)` | `Result<boolean, UserNotFound>` | Delete can fail if record was deleted |
| `count()` | `Result<number, never>` | Count either succeeds or throws |

**Rule:** If the operation can fail with a domain-meaningful error (not found, conflict), return `Result<T, E>`. If it can only fail due to infrastructure issues, return `Result<T, never>` and let infrastructure errors throw.

---

## Domain Events

Two clear levels. No fuzzy hand-waving.

### Level 1: Transactional Outbox (Default for Critical Events)

- Use the `OutboxService` combined with `DatabaseService` transactions.
- **NEVER** emit events directly in-memory if the event dropping would cause data inconsistency.
- Example: `UserCreated` → saving the user and dispatching the event to the outbox atomically.
- The outbox processor will reliably deliver the event to the queue or in-memory listeners safely.

```typescript
// modules/users/application/commands/create-user.command.ts
async createUser(data: CreateUserInput): Promise<Result<User, UserError>> {
  return await this.databaseService.withResultTransaction(async () => {
    // 1. Create user in the database
    const user = await this.userRepository.save(data);
    
    // 2. Dispatch the global event (saved atomically in the current transaction)
    await this.outboxService.dispatchGlobal("user.created", {
      userId: user.id,
      email: user.email,
    });
    
    return ok(user);
  });
}
```

### Outbox tenant and system scope

Outbox writes have an explicit scope. The scope is never inferred from request input or selected by
the client:

- `dispatchTenant(topic, payload)` derives the tenant ID from `TenantContextService`. In multi-tenant
  mode it returns `TENANT_SCOPE_REQUIRED` when no trusted tenant is active.
- `dispatchGlobal(topic, payload)` writes a null `tenant_id` only through
  `DatabaseService.withSystemScope`. This is used for global records such as user registration.
- `TenantContextService.run()` always disables system scope. Only internal workers and infrastructure
  workflows may call `runSystem()`; the `system` flag is not part of the public tenant contract.
- PostgreSQL RLS permits global rows with null `tenant_id` in single mode, or while the trusted
  transaction-local system scope is active in multi mode. Tenant rows must match the active tenant.

Every new event must be classified as global or tenant-owned and use the corresponding method. Add
RLS integration coverage for both accepted and rejected scopes, and test registration in every
supported `TENANCY_MODE`.

### Level 2: Reliable Async Work (BullMQ)

- When you need retries, persistence, backoff, or multi-instance safety.
- Application command/query publishes a job via BullMQ.
- Workers live in `infrastructure/queue/` or module-specific processors.

```typescript
// modules/users/application/commands/create-user.command.ts
async createUser(data: CreateUserInput): Promise<Result<User, UserError>> {
  // ... create user ...
  await this.queue.add("send-welcome-email", { userId: user.id, email: user.email });
  return ok(user);
}
```

### Promotion Rule

**Prefer in-process events.** Promote to BullMQ only when reliability requirements demand it:
- Need retries with backoff
- Need persistence across restarts
- Need multi-instance safety
- Need delayed execution

---

## Event Naming

- Events are named as past-tense nouns: `UserCreated`, `OrderPlaced`, `PaymentFailed`.
- One event per meaningful domain state change.
- Events carry enough data for listeners to act without querying the database.

---

## Event Listeners

- One listener per event concern (welcome email, analytics, notifications).
- Listeners are idempotent — safe to replay.
- Listeners never throw. Catch and log.
- Listeners live in `application/` (not in a separate `listeners/` folder at the module root).
