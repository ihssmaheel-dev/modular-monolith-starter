import { describe, expect, it } from "vitest";
import { IntelligenceHmacService } from "./intelligence-hmac.service";

describe("IntelligenceHmacService", () => {
  const service = new IntelligenceHmacService();
  const secret = "test-secret-min-32-chars-long-12345678";

  it("computes deterministic HMAC-SHA256 signatures", () => {
    const sig1 = service.computeSignature(
      secret,
      "POST",
      "/api/v1/chat/unary",
      "1710000000.0",
      JSON.stringify({ query: "test" }),
      "user-1",
      "tenant-1",
      "req-1",
    );
    const sig2 = service.computeSignature(
      secret,
      "POST",
      "/api/v1/chat/unary",
      "1710000000.0",
      JSON.stringify({ query: "test" }),
      "user-1",
      "tenant-1",
      "req-1",
    );
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(64);
  });

  it("creates expected authentication headers with user, tenant, and request context", () => {
    const headers = service.createAuthHeaders({
      secret,
      method: "POST",
      path: "/api/v1/embeddings/search",
      body: JSON.stringify({ query: "hello", limit: 5 }),
      userId: "user-123",
      tenantId: "tenant-456",
      requestId: "req-789",
    });

    expect(headers["X-Service-Signature"]).toBeDefined();
    expect(headers["X-Signature"]).toBeDefined();
    expect(headers["X-Timestamp"]).toBeDefined();
    expect(headers["X-User-Id"]).toBe("user-123");
    expect(headers["X-Tenant-Id"]).toBe("tenant-456");
    expect(headers["X-Request-Id"]).toBe("req-789");
  });

  it("matches cross-runtime cryptographic test vector parity with Python", () => {
    const sig = service.computeSignature(
      "deterministic-test-secret-key-32charsmin",
      "POST",
      "/api/v1/chat/unary",
      "1710000000.0000",
      JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
      "user_cuid_123",
      "tenant_cuid_456",
      "req_cuid_789",
    );
    expect(sig).toBe("b7583a90fd2f39885baa773ba7ac6f7676a26e2c1ef023da45384354d7ea6a03");
  });

  it("detects tampered payload, userId, or tenantId", () => {
    const testSecret = "deterministic-test-secret-key-32charsmin";
    const baseSig = service.computeSignature(
      testSecret,
      "POST",
      "/api/v1/chat/unary",
      "1710000000.0000",
      JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
      "user_cuid_123",
      "tenant_cuid_456",
      "req_cuid_789",
    );
    const tamperedPayloadSig = service.computeSignature(
      testSecret,
      "POST",
      "/api/v1/chat/unary",
      "1710000000.0000",
      JSON.stringify({ messages: [{ role: "user", content: "tampered" }] }),
      "user_cuid_123",
      "tenant_cuid_456",
      "req_cuid_789",
    );
    const tamperedTenantSig = service.computeSignature(
      testSecret,
      "POST",
      "/api/v1/chat/unary",
      "1710000000.0000",
      JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
      "user_cuid_123",
      "tenant_attacker",
      "req_cuid_789",
    );
    expect(tamperedPayloadSig).not.toBe(baseSig);
    expect(tamperedTenantSig).not.toBe(baseSig);
  });
});
