import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import etag from "@fastify/etag";

describe("HTTP ETag and 304 Conditional Requests", () => {
  it("generates ETag header and responds with 304 Not Modified when If-None-Match matches", async () => {
    const fastify = Fastify();
    await fastify.register(etag);

    fastify.get("/test", async () => {
      return { status: "ok", data: [1, 2, 3] };
    });

    const response1 = await fastify.inject({ method: "GET", url: "/test" });
    expect(response1.statusCode).toBe(200);
    const etagHeader = response1.headers["etag"] as string;
    expect(etagHeader).toBeDefined();
    expect(etagHeader.length).toBeGreaterThan(0);
    expect(response1.json()).toEqual({ status: "ok", data: [1, 2, 3] });

    const response2 = await fastify.inject({
      method: "GET",
      url: "/test",
      headers: { "if-none-match": etagHeader },
    });
    expect(response2.statusCode).toBe(304);
    expect(response2.body).toBe("");

    const response3 = await fastify.inject({
      method: "GET",
      url: "/test",
      headers: { "if-none-match": '"outdated-etag"' },
    });
    expect(response3.statusCode).toBe(200);
    expect(response3.json()).toEqual({ status: "ok", data: [1, 2, 3] });

    await fastify.close();
  });
});
