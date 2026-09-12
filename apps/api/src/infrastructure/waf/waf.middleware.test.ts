import { describe, expect, it, vi } from "vitest";
import { WafMiddleware } from "./waf.middleware";
import type { I18nService } from "../i18n/i18n.service";
import type { FastifyReply, FastifyRequest } from "fastify";

describe("WafMiddleware", () => {
  const mockI18n = {
    t: vi.fn().mockReturnValue("Blocked"),
    getLocale: vi.fn().mockReturnValue("en"),
  } as unknown as I18nService;

  const createRequest = (options: {
    url?: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): FastifyRequest =>
    ({
      url: options.url ?? "/api/v1/notes",
      query: options.query ?? {},
      body: options.body,
      headers: options.headers ?? {},
    }) as unknown as FastifyRequest;

  const createReply = () => {
    const res: Record<string, unknown> = {};
    res.header = vi.fn().mockReturnValue(res);
    res.status = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res as unknown as FastifyReply;
  };

  it("permits legitimate business content containing words select, update, and hash character (M11)", async () => {
    const middleware = new WafMiddleware(mockI18n);
    const req = createRequest({
      body: {
        title: "Please update the select field for ticket #42",
        content: "We should create a new guide and drop outdated instructions.",
      },
    });
    const res = createReply();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks stacked SQL injection attacks in body", async () => {
    const middleware = new WafMiddleware(mockI18n);
    const req = createRequest({
      body: {
        input: "'; DROP TABLE users--",
      },
    });
    const res = createReply();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("blocks UNION SELECT attacks in body", async () => {
    const middleware = new WafMiddleware(mockI18n);
    const req = createRequest({
      body: {
        search: "' UNION SELECT username, password FROM users--",
      },
    });
    const res = createReply();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("blocks header injection attempts", async () => {
    const middleware = new WafMiddleware(mockI18n);
    const req = createRequest({
      headers: {
        "x-custom": "value\r\nSet-Cookie: evil=1",
      },
    });
    const res = createReply();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
