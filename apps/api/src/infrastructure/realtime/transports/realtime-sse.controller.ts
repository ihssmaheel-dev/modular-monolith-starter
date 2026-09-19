import {
  Controller,
  ForbiddenException,
  Sse,
  Req,
  MessageEvent as NestMessageEvent,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { RealtimeService } from "../realtime.service";
import { Subject, Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import { NoDatabaseTransaction, TenantAgnostic, requireAuthenticatedUser } from "../../../common";
import { PinoLoggerService } from "../../logger/logger.service";
import { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import type { TenantContext } from "@repo/contracts";
import { decodeAccessTokenExpiry } from "../../../common/utils/access-token.utils";

const SSE_REVALIDATE_INTERVAL_MS = 60_000;
const SSE_FALLBACK_LIFETIME_MS = 60_000;

type TenantRequest = FastifyRequest & {
  tenant?: TenantContext;
  query?: Record<string, unknown>;
};

@Controller("realtime")
export class RealtimeSseController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly tenantAccess: ResolveTenantAccessQuery,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RealtimeSseController" });
  }

  private readonly logger: PinoLoggerService;

  @Sse("events")
  @NoDatabaseTransaction()
  @TenantAgnostic()
  async sse(@Req() request: TenantRequest): Promise<Observable<NestMessageEvent>> {
    const user = requireAuthenticatedUser(request);
    // EventSource cannot send headers, so the tenant travels as ?tenantId=.
    // Membership is resolved (never trusted blindly); an unresolvable
    // tenant degrades to the user-global scope instead of failing the
    // endlessly-retrying EventSource connection.
    const tenantId = await this.resolveTenant(user.sub, request);

    const subject = new Subject<NestMessageEvent>();
    this.realtimeService.addSseClient(user.sub, tenantId, subject);
    const timers = this.scheduleRevalidation(subject, user.sub, tenantId, request);

    subject.next({ data: { status: "connected" } } as NestMessageEvent);

    return subject.asObservable().pipe(
      finalize(() => {
        for (const timer of timers) clearTimeout(timer);
        this.realtimeService.removeSseClient(user.sub, tenantId, subject);
      }),
    );
  }

  private async resolveTenant(userId: string, request: TenantRequest): Promise<string | undefined> {
    const headerTenant = request.tenant?.tenantId;
    const rawQuery = request.query?.tenantId;
    const queryTenant = typeof rawQuery === "string" && rawQuery.length > 0 ? rawQuery : undefined;
    const tenantId = queryTenant ?? headerTenant;
    if (!tenantId) return headerTenant;
    const access = await this.tenantAccess.execute(userId, tenantId);
    if (access.isErr()) {
      this.logger.warn({ userId, tenantId }, "SSE tenant rejected");
      throw new ForbiddenException("api.error.forbidden");
    }
    return access.value.tenantId;
  }

  private scheduleRevalidation(
    subject: Subject<NestMessageEvent>,
    userId: string,
    tenantId: string | undefined,
    request: TenantRequest,
  ): NodeJS.Timeout[] {
    const expiresAt = this.accessTokenExpiry(request) ?? Date.now() + SSE_FALLBACK_LIFETIME_MS;
    const expiry = setTimeout(() => subject.complete(), Math.max(0, expiresAt - Date.now()));
    expiry.unref?.();
    if (!tenantId) return [expiry];
    let running = false;
    const membership = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const access = await this.tenantAccess.execute(userId, tenantId);
        if (access.isErr()) subject.complete();
      } catch (error) {
        this.logger.error({ error, userId, tenantId }, "SSE tenant access revalidation failed");
        subject.complete();
      } finally {
        running = false;
      }
    }, SSE_REVALIDATE_INTERVAL_MS);
    membership.unref?.();
    return [expiry, membership];
  }

  private accessTokenExpiry(request: TenantRequest): number | null {
    const authorization = request.headers?.authorization;
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      return decodeAccessTokenExpiry(authorization.slice(7));
    }
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.access_token;
    return token ? decodeAccessTokenExpiry(token) : null;
  }
}
