import { Controller, Sse, Req, MessageEvent as NestMessageEvent } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { RealtimeService } from "../realtime.service";
import { Subject, Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import { NoDatabaseTransaction, TenantAgnostic, requireAuthenticatedUser } from "../../../common";
import type { TenantContext } from "@repo/contracts";

type TenantRequest = FastifyRequest & { tenant?: TenantContext };

@Controller("realtime")
export class RealtimeSseController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse("events")
  @NoDatabaseTransaction()
  @TenantAgnostic()
  sse(@Req() request: TenantRequest): Observable<NestMessageEvent> {
    const user = requireAuthenticatedUser(request);
    const tenantId = request.tenant?.tenantId;

    const subject = new Subject<NestMessageEvent>();
    this.realtimeService.addSseClient(user.sub, tenantId, subject);

    subject.next({ data: { status: "connected" } } as NestMessageEvent);

    return subject.asObservable().pipe(
      finalize(() => {
        this.realtimeService.removeSseClient(user.sub, tenantId, subject);
      }),
    );
  }
}
