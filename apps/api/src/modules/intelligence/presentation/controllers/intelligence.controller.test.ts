import { describe, expect, it, vi, beforeEach } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { err, ok } from "neverthrow";
import type { FastifyRequest } from "fastify";
import { IntelligenceController } from "./intelligence.controller";
import type { ExecuteUnaryChatCommand } from "../../application/commands/execute-unary-chat.command";
import type { SearchIntelligenceDocumentsQuery } from "../../application/queries/search-intelligence-documents.query";
import type { TenantContextService } from "../../../../infrastructure/database";
import type { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { IntelligenceDisabledError } from "../../domain/errors/intelligence.errors";

describe("IntelligenceController", () => {
  let controller: IntelligenceController;
  let executeUnaryChatCommand: ExecuteUnaryChatCommand;
  let searchDocumentsQuery: SearchIntelligenceDocumentsQuery;
  let tenantContext: TenantContextService;
  let i18n: I18nService;

  beforeEach(() => {
    executeUnaryChatCommand = {
      execute: vi.fn(),
    } as unknown as ExecuteUnaryChatCommand;

    searchDocumentsQuery = {
      execute: vi.fn(),
    } as unknown as SearchIntelligenceDocumentsQuery;

    tenantContext = {
      get: vi.fn().mockReturnValue({ mode: "multi", tenantId: "tenant-1" }),
    } as unknown as TenantContextService;

    i18n = {
      t: vi.fn().mockImplementation((key: string) => `Translated:${key}`),
    } as unknown as I18nService;

    controller = new IntelligenceController(
      executeUnaryChatCommand,
      searchDocumentsQuery,
      tenantContext,
      i18n,
    );
  });

  const mockRequest = {
    headers: {
      "x-request-id": "req-123",
      "accept-language": "en",
    },
    user: {
      sub: "user-1",
      email: "user@example.com",
      role: "user",
    },
  } as unknown as FastifyRequest;

  it("chat endpoint returns UnaryChatResponse when command succeeds", async () => {
    const mockResponse = {
      content: "AI reply",
      model: "gpt-4o-mini",
      usage: { totalTokens: 25 },
    };
    vi.mocked(executeUnaryChatCommand.execute).mockResolvedValue(ok(mockResponse));

    const result = await controller.chat(
      { messages: [{ role: "user", content: "hello" }] },
      mockRequest,
    );

    expect(result).toEqual(mockResponse);
    expect(executeUnaryChatCommand.execute).toHaveBeenCalledWith(
      { messages: [{ role: "user", content: "hello" }] },
      expect.objectContaining({
        tenantId: "tenant-1",
        requestId: "req-123",
      }),
    );
  });

  it("chat endpoint maps IntelligenceDisabledError to 503 with i18n message", async () => {
    vi.mocked(executeUnaryChatCommand.execute).mockResolvedValue(
      err(new IntelligenceDisabledError()),
    );

    await expect(
      controller.chat({ messages: [{ role: "user", content: "hello" }] }, mockRequest),
    ).rejects.toThrow(HttpException);

    try {
      await controller.chat({ messages: [{ role: "user", content: "hello" }] }, mockRequest);
    } catch (exc) {
      const httpExc = exc as HttpException;
      expect(httpExc.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const res = httpExc.getResponse() as Record<string, unknown>;
      expect(res.i18nKey).toBe("intelligence.errors.disabled");
      expect(res.message).toBe("Translated:intelligence.errors.disabled");
    }
  });

  it("search endpoint returns document results when query succeeds", async () => {
    const mockResults = [
      {
        id: "doc-1",
        sourceType: "note",
        sourceId: "note-1",
        content: "Matched note",
        score: 0.95,
        metadata: {},
      },
    ];
    vi.mocked(searchDocumentsQuery.execute).mockResolvedValue(ok(mockResults));

    const result = await controller.search(
      { query: "search terms", limit: 5, offset: 0 },
      mockRequest,
    );

    expect(result).toEqual(mockResults);
    expect(searchDocumentsQuery.execute).toHaveBeenCalledWith(
      { query: "search terms", limit: 5, offset: 0 },
      "tenant-1",
      expect.objectContaining({ requestId: "req-123" }),
    );
  });
});
