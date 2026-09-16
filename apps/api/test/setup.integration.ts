import "dotenv/config";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\/+/, "");
if (!databaseName.toLowerCase().includes("test")) {
  throw new Error("TEST_DATABASE_URL must point to a test database.");
}

process.env.REQUIRE_INTEGRATION_DB = "true";
