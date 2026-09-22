import { Controller, ForbiddenException, Get, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { TenantContext } from "@repo/contracts";

import {
  NoDatabaseTransaction,
  RequirePermission,
  TenantAgnostic,
  requireAuthenticatedUser,
} from "../../../common";
import { decodeAccessTokenExpiry } from "../../../common/utils/access-token.utils";
import { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import { PinoLoggerService } from "../../logger/logger.service";
import { RealtimeService } from "../realtime.service";
import { SseConnection } from "./sse-connection";

const SSE_REVALIDATE_INTERVAL_MS = 60_000;
const SSE_FALLBACK_LIFETIME_MS = 60_000;

type TenantRequest = FastifyRequest & {
  tenant?: TenantContext;
  query?: Record<string, unknown>;
};

@Controller("realtime")
export class RealtimeSseController {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly tenantAccess: ResolveTenantAccessQuery,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RealtimeSseController" });
  }

  @Get("events")
  @RequirePermission("notifications:read")
  @NoDatabaseTransaction()
  @TenantAgnostic()
  async sse(@Req() request: TenantRequest, @Res() reply: FastifyReply): Promise<void> {
    const user = requireAuthenticatedUser(request);
    const tenantId = await this.resolveTenant(user.sub, request);

    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    });

    let registered = false;
    let timers: NodeJS.Timeout[] = [];
    const connection = new SseConnection(reply.raw, (reason, queuedBytes) => {
      for (const timer of timers) clearTimeout(timer);
      timers = [];
      if (registered) {
        registered = false;
        this.realtimeService.removeSseClient(user.sub, tenantId, connection, reason, queuedBytes);
      }
    });

    if (!this.realtimeService.addSseClient(user.sub, tenantId, connection)) return;
    registered = true;
    if (connection.closed) {
      registered = false;
      this.realtimeService.removeSseClient(user.sub, tenantId, connection);
      return;
    }

    timers = this.scheduleRevalidation(connection, user.sub, tenantId, request);
    connection.send("connected", { status: "connected" });
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
    connection: SseConnection,
    userId: string,
    tenantId: string | undefined,
    request: TenantRequest,
  ): NodeJS.Timeout[] {
    const expiresAt = this.accessTokenExpiry(request) ?? Date.now() + SSE_FALLBACK_LIFETIME_MS;
    const expiry = setTimeout(
      () => connection.close("server_closed"),
      Math.max(0, expiresAt - Date.now()),
    );
    expiry.unref?.();
    if (!tenantId) return [expiry];

    let running = false;
    const membership = setInterval(async () => {
      if (running || connection.closed) return;
      running = true;
      try {
        const access = await this.tenantAccess.execute(userId, tenantId);
        if (access.isErr()) connection.close("server_closed");
      } catch (error) {
        this.logger.error({ error, userId, tenantId }, "SSE tenant access revalidation failed");
        connection.close("server_closed");
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
