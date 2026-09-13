import { describe, it, expect, beforeEach, vi } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { ok, err } from "neverthrow";
import { AiController } from "./ai.controller";
import type { AiService } from "../../../../infrastructure/ai/ai.service";
import type { TenantContextService } from "../../../../infrastructure/database";
import type { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import type { FastifyRequest } from "fastify";

describe("AiController", () => {
  let controller: AiController;
  let mockAiService: AiService;
  let mockTenantContext: TenantContextService;
  let mockI18n: I18nService;

  beforeEach(() => {
    mockAiService = {
      chat: vi.fn(),
      streamChat: vi.fn(),
      generateEmbeddings: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true),
    } as unknown as AiService;

    mockTenantContext = {
      get: vi.fn().mockReturnValue({ tenantId: "tenant-abc" }),
    } as unknown as TenantContextService;

    mockI18n = {
      t: vi.fn((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key),
    } as unknown as I18nService;

    controller = new AiController(mockAiService, mockTenantContext, mockI18n);
  });

  it("returns chat response successfully", async () => {
    const mockResponse = {
      message: { role: "assistant" as const, content: "Hello back" },
      finishReason: "stop" as const,
      model: "mock-model",
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      latencyMs: 50,
    };

    vi.mocked(mockAiService.chat).mockResolvedValue(ok(mockResponse));

    const mockReq = {
      headers: { traceparent: "trace-123", "x-request-id": "req-1" },
    } as unknown as FastifyRequest;

    const result = await controller.chat({ messages: [{ role: "user", content: "Hi" }] }, mockReq);

    expect(result).toEqual(mockResponse);
    expect(mockAiService.chat).toHaveBeenCalledWith(
      { messages: [{ role: "user", content: "Hi" }] },
      expect.objectContaining({
        "x-tenant-id": "tenant-abc",
        traceparent: "trace-123",
      }),
    );
  });

  it("throws 503 when AI service is disabled", async () => {
    vi.mocked(mockAiService.chat).mockResolvedValue(
      err({ type: "AI_DISABLED", message: "AI service is disabled" }),
    );

    const mockReq = { headers: {} } as unknown as FastifyRequest;

    await expect(
      controller.chat({ messages: [{ role: "user", content: "Hi" }] }, mockReq),
    ).rejects.toThrow(HttpException);

    try {
      await controller.chat({ messages: [{ role: "user", content: "Hi" }] }, mockReq);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    }
  });

  it("throws 502 when upstream AI service fails", async () => {
    vi.mocked(mockAiService.chat).mockResolvedValue(
      err({ type: "AI_UNAVAILABLE", message: "Provider offline" }),
    );

    const mockReq = { headers: {} } as unknown as FastifyRequest;

    try {
      await controller.chat({ messages: [{ role: "user", content: "Hi" }] }, mockReq);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    }
  });
});
