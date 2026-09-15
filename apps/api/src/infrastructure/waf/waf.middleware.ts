import { BadRequestException, Injectable, NestMiddleware, HttpStatus } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { HEADER_INJECTION_PATTERNS, scanObject, containsPattern } from "./waf.patterns";
import { I18nService } from "../i18n/i18n.service";
import { createApiErrorEnvelope } from "../../common/utils/error-envelope.utils";
import { REQUEST_ID_HEADER, resolveRequestId } from "../../common/utils/request-id.utils";

const MAX_URL_LENGTH = 2048;

@Injectable()
export class WafMiddleware implements NestMiddleware {
  constructor(private readonly i18n: I18nService) {}

  async use(req: FastifyRequest, res: FastifyReply, next: () => void): Promise<void> {
    const url = req.url ?? "";
    const lang = req.headers["accept-language"] as string | undefined;

    if (url.length > MAX_URL_LENGTH) {
      this.reject(res, req, "api.error.urlTooLong", lang);
      return;
    }

    const query = (req.query ?? {}) as Record<string, unknown>;
    if (Object.keys(query).length > 0) {
      if (scanObject(query).length > 0) {
        this.reject(res, req, "api.error.invalidRequest", lang);
        return;
      }
    }

    const body = req.body as Record<string, unknown> | undefined;
    if (body && typeof body === "object") {
      if (scanObject(body).length > 0) {
        this.reject(res, req, "api.error.invalidRequest", lang);
        return;
      }
    }

    for (const [, value] of Object.entries(req.headers)) {
      if (typeof value === "string" && containsPattern(value, HEADER_INJECTION_PATTERNS)) {
        this.reject(res, req, "api.error.invalidHeader", lang);
        return;
      }
    }

    next();
  }

  private reject(
    response: FastifyReply,
    request: FastifyRequest,
    i18nKey: string,
    language: string | undefined,
  ): void {
    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
    const envelope = createApiErrorEnvelope(
      new BadRequestException({ code: "INVALID_REQUEST", i18nKey }),
      HttpStatus.BAD_REQUEST,
      language,
      requestId,
      this.i18n,
    );
    response.header(REQUEST_ID_HEADER, requestId).status(HttpStatus.BAD_REQUEST).send(envelope);
  }
}
