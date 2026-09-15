# Performance Rules

Write efficient code. Performance is not optional — it's a design constraint.

---

## Database Queries

### PostgreSQL / Drizzle ORM
- **Always add indexes** for columns used in filters, joins, sorts, and compound conditions.
- **Select specific columns** when full entity rows are not needed.
- **Batch writes** with `insert().values([...])` instead of looping single inserts.
- **Use `sql<number>count(*)`** for efficient counts.
- **Always use connection pooling** (`pg.Pool`) with bounded `max` pool size.

```typescript
// Bad
const users = await db.select().from(usersTable);
const count = users.length;

// Good
const [users, [{ count }]] = await Promise.all([
  db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.role, "admin")),
  db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.role, "admin")),
]);
```

### N+1 Prevention
- Never query inside a loop. Use `inArray()` for batch lookups.
- If you need related data, join or batch in parallel — don't loop queries.

```typescript
// Bad
for (const order of orders) {
  const user = await this.userRepository.findById(order.userId);
  order.user = user;
}

// Good
const userIds = orders.map((o) => o.userId);
const users = await this.db.select().from(usersTable).where(inArray(usersTable.id, userIds));
const userMap = new Map(users.map((u) => [u.id, u]));
```

---

## Caching

### Redis
- Cache expensive queries and computed results.
- Set TTL. Never cache forever.
- Use cache-aside pattern: check cache → miss → query DB → set cache.

```typescript
async getUser(id: string): Promise<User | null> {
  const cached = await this.redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await this.userRepository.findById(id);
  if (user) await this.redis.set(`user:${id}`, JSON.stringify(user), "EX", 3600);
  return user;
}
```

### Invalidation
- Invalidate cache on write (update/delete).
- Use event-driven invalidation: `user.updated` → invalidate `user:{id}`.
- Accept eventual consistency for non-critical data.

---

## API Responses

### Pagination
- Always paginate list endpoints. Never return unbounded arrays.
- Default limit: 20. Max limit: 100.
- Return `{ data, total, page, limit }` for every list endpoint.

### Response Size
- Don't return fields the client doesn't need.
- Use field selection in the repository layer.
- Compress responses with Fastify gzip.

### Rate Limiting
- Apply rate limiting to all public endpoints.
- Stricter limits on auth endpoints (login, register).
- Use Redis-backed rate limiting for multi-instance safety.

### Transaction Occupancy
- Never hold a database transaction while hashing passwords, calling Redis or external services,
  streaming a response, or performing other slow non-SQL work.
- HTTP handlers doing such work use `@NoDatabaseTransaction()`; commands open short explicit
  transactions around only the related SQL changes and transactional outbox writes.
- Size pools from measured concurrency and alert on waiting clients. Increasing pool size does not
  repair an unnecessarily long transaction boundary.

---

## CPU-Bound Work — Piscina Worker Threads

Never block the Node.js event loop with CPU-intensive work. Use Piscina worker threads.

### When to Use Which

| Use Case | Tool | Why |
|----------|------|-----|
| Send email, generate PDF, process webhook | BullMQ | Needs persistence, retries, multi-instance safety |
| Parse large CSV, image resize, crypto hash | Piscina | CPU-bound, in-process, no Redis overhead |
| Delayed job ("send notification in 1 hour") | BullMQ | Needs delayed execution |
| Parallel CPU work ("process 1000 rows") | Piscina | Fast context switch, no serialization cost |
| Background job that must survive restarts | BullMQ | Persistent queue |
| One-off heavy computation in a request | Piscina | Fast, no queue overhead |

### Infrastructure

```
src/infrastructure/
├── queue/          ← BullMQ (persistent, distributed jobs)
│   ├── queue.module.ts
│   └── queue.service.ts
└── workers/        ← Piscina (CPU-bound, in-process work)
    ├── workers.module.ts
    ├── piscina.service.ts
    └── tasks/
        ├── csv-parser.ts
        └── hash.ts
```

### Usage

```typescript
import { PiscinaService } from "../infrastructure/workers/piscina.service";

@Injectable()
export class ImportService {
  constructor(private readonly piscina: PiscinaService) {}

  async importCsv(rows: CsvRow[]) {
    const pool = this.piscina.getPool({
      name: "csv",
      filename: path.resolve(__dirname, "workers/tasks/csv-parser.js"),
      maxThreads: 4,
    });

    const chunkSize = 100;
    const chunks: CsvRow[][] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      chunks.push(rows.slice(i, i + chunkSize));
    }

    const results = await Promise.all(
      chunks.map((chunk) =>
        this.piscina.run<CsvRow[], ParsedRow[]>("csv", "parseCsvChunk", chunk),
      ),
    );

    return results.flat();
  }
}
```

### Rules
- Worker files must be plain `.js` or `.ts` (Piscina handles transpilation).
- Worker functions must be exported as named exports.
- Don't send complex classes to workers — serialize to plain objects or strings first.
- Workers must not import NestJS modules or services.
- Workers can import pure utility functions from `@repo/contracts`.
- Set `maxThreads` based on workload: I/O-heavy = more threads, CPU-heavy = `os.cpus().length`.

---

## Node.js / NestJS Event Loop & Memory

### Event Loop
- Never block the event loop with synchronous operations.
- Use `Promise.all()` for independent async operations.
- Use Piscina worker threads for CPU-intensive tasks (see section above).

### Memory
- Don't accumulate data in memory. Stream when possible.
- Clean up event listeners and timers.
- Use `WeakRef` for caches that should be garbage-collected.

### Startup
- Validate env vars once at startup (already done in `config/env.ts`).
- Lazy-connect to Redis/Postgres. Don't block app start unless required.

---

## Observability & Metrics

- Inject the `MetricsService` and record business-critical actions.
- **Counters**: Use for cumulative counts (e.g., `incrementCounter("orders_placed_total")`).
- **Gauges**: Use for point-in-time values (e.g., `setGauge("active_users", count)`).
- **Histograms**: Use for durations and sizes (e.g., `startTimer("api_request_duration_seconds")`).
- Log slow queries (>100ms) via Pino.
- Alert on memory usage spikes.

---

## External Resilience (Circuit Breakers)

- **NEVER** call 3rd-party services (like Email Providers, Payment Gateways) directly.
- Wrap external calls in a `CircuitBreaker`.
- Use the `MetricsService` inside the Circuit Breaker callback (`onStateChange`) to emit `circuit_breaker_state` gauge metrics and trip counters.
- This prevents cascading failures from taking down the monolith when external services degrade.

---

## The Rule

Before writing any code, ask:
1. Will this query scale to 100k documents?
2. Will this component re-render unnecessarily?
3. Is there a cached result I should check first?
4. Am I fetching more data than I need?
5. Is this operation blocking the event loop?
6. Should this CPU work run in a worker thread?

If the answer to any is concerning — optimize before shipping.
