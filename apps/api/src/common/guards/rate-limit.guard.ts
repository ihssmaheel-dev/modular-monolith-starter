import { Injectable, CanActivate, ExecutionContext, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimitService } from "../../infrastructure/rate-limit/rate-limit.service";
import { I18nService } from "../../infrastructure/i18n/i18n.service";
import { RATE_LIMIT_KEY, RateLimitMetadata } from "../decorators/rate-limit.decorator";
import type { FastifyRequest, FastifyReply } from "fastify";
import { HttpException } from "@nestjs/common";

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_SECONDS = 60;
const MILLISECONDS_PER_SECOND = 1000;

const RATE_LIMIT_HEADERS = {
  REMAINING: "X-RateLimit-Remaining",
  RESET: "X-RateLimit-Reset",
  LIMIT: "X-RateLimit-Limit",
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const res = ctx.getResponse<FastifyReply>();

    const metadata = this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const maxRequests = metadata?.maxRequests ?? DEFAULT_MAX_REQUESTS;
    const windowSeconds = metadata?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;

    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    // Prefer the route template: raw URLs carry resource IDs and would
    // explode both Redis key and metric cardinality on random paths.
    const route = req.routeOptions?.url ?? "unmatched";
    const lang = req.headers["accept-language"] as string | undefined;

    const result = await this.rateLimitService.check(`ip:${ip}:route:${route}`, {
      windowSeconds,
      maxRequests,
    });

    res.header(RATE_LIMIT_HEADERS.LIMIT, maxRequests.toString());
    res.header(RATE_LIMIT_HEADERS.REMAINING, result.remaining.toString());
    res.header(RATE_LIMIT_HEADERS.RESET, result.resetAt.toString());

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: this.i18n.t("api.error.rateLimited", lang),
          i18nKey: "api.error.rateLimited",
          fieldErrors: {},
          retry: {
            retryable: true,
            retryAfterMs: Math.max(0, result.resetAt * MILLISECONDS_PER_SECOND - Date.now()),
          },
          error: "RATE_LIMITED",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
