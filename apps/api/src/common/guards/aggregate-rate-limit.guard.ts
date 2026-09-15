import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser } from "@repo/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { I18nService } from "../../infrastructure/i18n/i18n.service";
import { RateLimitService } from "../../infrastructure/rate-limit/rate-limit.service";
import { TenantContextService } from "../../infrastructure/database";
import { RATE_LIMIT_KEY, type RateLimitMetadata } from "../decorators/rate-limit.decorator";

@Injectable()
export class AggregateRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rates: RateLimitService,
    private readonly tenants: TenantContextService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata) return true;
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const actor = request.user as AuthenticatedUser | undefined;
    const tenantId = this.tenants.get().tenantId;
    if (actor) await this.enforce(`actor:${actor.sub}`, metadata, request, reply);
    if (tenantId) await this.enforce(`tenant:${tenantId}`, metadata, request, reply);
    return true;
  }

  private async enforce(
    identity: string,
    metadata: RateLimitMetadata,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const route = request.routeOptions?.url ?? "unmatched";
    const result = await this.rates.check(`${identity}:route:${route}`, {
      ...metadata,
      failClosed: true,
    });
    if (result.allowed) return;
    reply.header("Retry-After", Math.max(1, result.resetAt - Math.floor(Date.now() / 1_000)));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: this.i18n.t("api.error.rateLimited", request.headers["accept-language"]),
        i18nKey: "api.error.rateLimited",
        fieldErrors: {},
        error: "RATE_LIMITED",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
