import { afterAll } from "vitest";
import { GenericContainer, StartedTestContainer } from "testcontainers";

if (process.env.E2E_USE_CONTAINERS !== "true") {
  throw new Error("E2E_USE_CONTAINERS=true is required for API E2E tests.");
}

// This suite exercises the HTTP process. Dedicated worker behavior is covered
// by integration and unit suites and must not race API assertions here.
process.env.PROCESS_ROLE = "api";

const postgresContainer: StartedTestContainer = await new GenericContainer("postgres:16-alpine")
  .withEnvironment({
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: "postgres",
    POSTGRES_DB: "e2e-test",
  })
  .withExposedPorts(5432)
  .start();

const databaseUrl = `postgres://postgres:postgres@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/e2e-test`;
process.env.DATABASE_URL = databaseUrl;

const redisContainer: StartedTestContainer = await new GenericContainer("redis:7.0-alpine")
  .withExposedPorts(6379)
  .start();

process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

const { runMigrations } = await import("../src/infrastructure/database/migrate");
await runMigrations(databaseUrl);

afterAll(async () => {
  await postgresContainer.stop();
  await redisContainer.stop();
});
