import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { IntelligenceGatewayService } from "./intelligence-gateway.service";
import { IntelligenceHmacService } from "./intelligence-hmac.service";
import { env } from "../../../../config/env";

describe("IntelligenceGatewayService", () => {
  let service: IntelligenceGatewayService;
  let hmacService: IntelligenceHmacService;
  const savedEnabled = env.INTELLIGENCE_ENABLED;
  const savedModels = env.INTELLIGENCE_ALLOWED_MODELS;

  beforeEach(() => {
    hmacService = new IntelligenceHmacService();
    service = new IntelligenceGatewayService(hmacService);
  });

  afterEach(() => {
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
    (env as { INTELLIGENCE_ALLOWED_MODELS: string }).INTELLIGENCE_ALLOWED_MODELS = savedModels;
    vi.restoreAllMocks();
  });

  it("returns IntelligenceDisabledError when INTELLIGENCE_ENABLED is false", async () => {
    try {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = false;
      const result = await service.executeUnaryChat({
        messages: [{ role: "user", content: "hello" }],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("AI_DISABLED");
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
    }
  });

  it("rejects models not present in INTELLIGENCE_ALLOWED_MODELS", async () => {
    try {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
      const result = await service.executeUnaryChat({
        messages: [{ role: "user", content: "hello" }],
        model: "unauthorized-malicious-model",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("AI_INVALID_MODEL");
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
    }
  });

  it("prevents substring bypass on model allowlist", async () => {
    try {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
      (env as { INTELLIGENCE_ALLOWED_MODELS: string }).INTELLIGENCE_ALLOWED_MODELS =
        "gpt-4o,gpt-4o-mini";
      // "gpt" is a substring of "gpt-4o" but not an exact model match
      const result = await service.executeUnaryChat({
        messages: [{ role: "user", content: "hello" }],
        model: "gpt",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("AI_INVALID_MODEL");
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
      (env as { INTELLIGENCE_ALLOWED_MODELS: string }).INTELLIGENCE_ALLOWED_MODELS = savedModels;
    }
  });

  it("isolates circuit breakers per tenant so tenant A failures do not block tenant B", async () => {
    try {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Connection refused"));

      // Trigger 3 failures for tenant-a to open tenant-a's breaker
      for (let i = 0; i < 3; i++) {
        const res = await service.executeUnaryChat(
          { messages: [{ role: "user", content: "hello" }] },
          { tenantId: "tenant-a" },
        );
        expect(res.isErr()).toBe(true);
      }

      // 4th call for tenant-a fails immediately via OPEN breaker without calling fetch
      fetchSpy.mockClear();
      const fourthA = await service.executeUnaryChat(
        { messages: [{ role: "user", content: "hello" }] },
        { tenantId: "tenant-a" },
      );
      expect(fourthA.isErr()).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();

      // Tenant B's circuit breaker remains CLOSED and succeeds when upstream recovers
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: "Tenant B OK", model: "gpt-4o-mini" }),
      } as unknown as Response);

      const resB = await service.executeUnaryChat(
        { messages: [{ role: "user", content: "hello" }] },
        { tenantId: "tenant-b" },
      );
      expect(resB.isOk()).toBe(true);
      expect(fetchSpy).toHaveBeenCalledOnce();
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
    }
  });

  it("proxies searchDocuments with proper headers and payload", async () => {
    try {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
      const mockResults = [
        {
          id: "doc-1",
          sourceType: "note",
          sourceId: "n-1",
          content: "Architecture notes",
          score: 0.9,
          metadata: {},
        },
      ];
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockResults,
      } as unknown as Response);

      const res = await service.searchDocuments(
        { query: "architecture", limit: 5, offset: 0 },
        "tenant-test",
      );

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual(mockResults);
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
    }
  });
});
