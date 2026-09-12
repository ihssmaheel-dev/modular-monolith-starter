import { Controller, Sse, Req, MessageEvent as NestMessageEvent } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { RealtimeService } from "../realtime.service";
import { Subject, Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import { NoDatabaseTransaction, TenantAgnostic, requireAuthenticatedUser } from "../../../common";
import { PinoLoggerService } from "../../logger/logger.service";
import { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import type { TenantContext } from "@repo/contracts";

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

    subject.next({ data: { status: "connected" } } as NestMessageEvent);

    return subject.asObservable().pipe(
      finalize(() => {
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
      this.logger.warn({ userId, tenantId }, "SSE tenant rejected, using user-global scope");
      return undefined;
    }
    return access.value.tenantId;
  }
}
