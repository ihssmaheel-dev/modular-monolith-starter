import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { recordMatches, parseIdempotencyRecord } from "./idempotency-record.utils";
import { requestFingerprint } from "./idempotency.utils";

function request(init: {
  method?: string;
  url?: string;
  template?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}): FastifyRequest {
  return {
    method: init.method ?? "DELETE",
    url: init.url ?? "/api/v1/notes/one",
    routeOptions: { url: init.template ?? "/notes/:id" },
    query: init.query ?? {},
    body: init.body,
  } as unknown as FastifyRequest;
}

describe("requestFingerprint", () => {
  it("distinguishes different resources behind the same route template (H15)", () => {
    const one = requestFingerprint(request({ url: "/api/v1/notes/one" }));
    const two = requestFingerprint(request({ url: "/api/v1/notes/two" }));

    expect(one.route).toBe("/notes/:id");
    expect(two.route).toBe("/notes/:id");
    expect(one.path).toBe("/api/v1/notes/one");
    expect(two.path).toBe("/api/v1/notes/two");
    expect(one.digest).not.toBe(two.digest);
  });

  it("is stable for retries of the same operation", () => {
    const first = requestFingerprint(request({ url: "/api/v1/notes/one" }));
    const retry = requestFingerprint(request({ url: "/api/v1/notes/one" }));

    expect(retry).toEqual(first);
  });

  it("distinguishes query parameters regardless of key order", () => {
    const a = requestFingerprint(request({ url: "/x", query: { b: 2, a: 1 } }));
    const b = requestFingerprint(request({ url: "/x", query: { a: 1, b: 2 } }));
    const c = requestFingerprint(request({ url: "/x", query: { a: 1 } }));

    expect(b.digest).toBe(a.digest);
    expect(c.digest).not.toBe(a.digest);
  });

  it("matches records carrying the same identity and rejects different ones", () => {
    const fingerprint = requestFingerprint(request({ url: "/api/v1/notes/one" }));
    const raw = JSON.stringify({
      state: "completed",
      fingerprint: fingerprint.digest,
      method: fingerprint.method,
      route: fingerprint.route,
      path: fingerprint.path,
      queryHash: fingerprint.queryHash,
      bodyHash: fingerprint.bodyHash,
      body: { id: 1 },
      bodyBytes: 10,
      completedAt: Date.now(),
    });

    expect(recordMatches(parseIdempotencyRecord(raw), fingerprint)).toBe(true);
    const other = requestFingerprint(request({ url: "/api/v1/notes/two" }));
    expect(recordMatches(parseIdempotencyRecord(raw), other)).toBe(false);
  });
});
