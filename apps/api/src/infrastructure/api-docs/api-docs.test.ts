import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { API_BASE_PATH } from "@repo/contracts";
import { setupApiDocs } from "./api-docs";

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "development",
    API_URL: "http://localhost:5156",
  },
}));

describe("setupApiDocs", () => {
  it("should register API docs endpoints on fastify instance", async () => {
    const fastify = Fastify();
    const mockApp = {
      getHttpAdapter: () => ({
        getInstance: () => fastify,
      }),
    } as unknown as NestFastifyApplication;

    await setupApiDocs(mockApp);
    await fastify.ready();

    const jsonRes = await fastify.inject({ method: "GET", url: "/api/docs/json" });
    expect(jsonRes.statusCode).toBe(200);
    expect(jsonRes.headers["content-type"]).toContain("application/json");

    const spec = jsonRes.json();
    expect(spec.paths["/auth/register"].post.requestBody).toBeDefined();
    expect(spec.paths["/auth/register"].post.responses["201"]).toBeDefined();
    expect(spec.servers.map((server: { url: string }) => server.url)).toContain(
      `${API_BASE_PATH}/rpc`,
    );
    expect(
      spec.paths["/tenancy/members/{userId}"].patch.parameters.some(
        (parameter: { name: string; in: string }) =>
          parameter.name === "x-tenant-id" && parameter.in === "header",
      ),
    ).toBe(true);

    const docsRes = await fastify.inject({ method: "GET", url: "/api/docs" });
    expect([200, 301, 302]).toContain(docsRes.statusCode);

    const docsSlashRes = await fastify.inject({ method: "GET", url: "/api/docs/" });
    expect(docsSlashRes.statusCode).toBe(200);
    expect(docsSlashRes.headers["content-type"]).toContain("text/html");
  }, 30000);
});
