import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
} from "@nestjs/websockets";
import { Optional } from "@nestjs/common";
import { Server, WebSocket } from "ws";
import { RealtimeService } from "../realtime.service";
import { PinoLoggerService } from "../../../infrastructure/logger/logger.service";
import { clientOrigins } from "../../../common/utils/origin.utils";
import { verifyAccessToken } from "../../../common/utils/access-token.utils";
import { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import { GetUserByIdQuery } from "../../../modules/users/application/queries/get-user-by-id.query";

const WS_READY_STATE_OPEN = 1;
const ACCESS_TOKEN_COOKIE = "access_token";

interface HandshakeRequest {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface SocketIdentity {
  userId: string;
  tenantId?: string;
}

// Declared handshake origins come from the same trust source as HTTP
// CORS. Explicit per-handshake Origin enforcement is H16 follow-up work.
@WebSocketGateway({ cors: { origin: clientOrigins() } })
export class RealtimeWebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private socketIdentity = new Map<WebSocket, SocketIdentity>();

  constructor(
    private readonly realtime: RealtimeService,
    private readonly tenantAccess: ResolveTenantAccessQuery,
    private readonly logger: PinoLoggerService,
    @Optional() private readonly getUserById?: GetUserByIdQuery,
  ) {}

  async handleConnection(@ConnectedSocket() client: WebSocket, ...args: unknown[]): Promise<void> {
    const request = args[0] as HandshakeRequest | undefined;
    const token = this.extractToken(request);
    const user = token ? verifyAccessToken(token) : null;

    if (!user) {
      client.close();
      return;
    }

    if (this.getUserById) {
      const current = await (this.getUserById.executeFresh?.(user.sub) ??
        this.getUserById.execute(user.sub));
      if (current.isErr() || user.authVersion !== current.value.authVersion) {
        client.close();
        return;
      }
    }

    const access = await this.tenantAccess.execute(user.sub, this.extractTenantId(request));
    if (access.isErr()) {
      client.close();
      return;
    }
    const identity = { userId: user.sub, tenantId: access.value.tenantId };
    this.socketIdentity.set(client, identity);
    this.realtime.addWsClient(identity.userId, identity.tenantId, client);
    this.logger.debug(identity, "WS connected");
  }

  handleDisconnect(@ConnectedSocket() client: WebSocket): void {
    const identity = this.socketIdentity.get(client);
    if (identity) {
      this.realtime.removeWsClient(identity.userId, identity.tenantId, client);
      this.socketIdentity.delete(client);
      this.logger.debug(
        { userId: identity.userId, tenantId: identity.tenantId },
        "WS disconnected",
      );
    }
  }

  @SubscribeMessage("ping")
  handlePing(@ConnectedSocket() client: WebSocket): void {
    if (client.readyState === WS_READY_STATE_OPEN) {
      client.send(JSON.stringify({ event: "pong", payload: null }));
    }
  }

  private extractToken(request?: HandshakeRequest): string | null {
    const authorization = request?.headers?.authorization;
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      return authorization.slice(7);
    }

    const cookie = request?.headers?.cookie;
    if (typeof cookie !== "string") return null;
    return this.readCookie(cookie, ACCESS_TOKEN_COOKIE);
  }

  private readCookie(header: string, name: string): string | null {
    for (const item of header.split(";")) {
      const [key, ...value] = item.trim().split("=");
      if (key === name) return decodeURIComponent(value.join("="));
    }
    return null;
  }

  private extractTenantId(request?: HandshakeRequest): string | undefined {
    const header = request?.headers?.["x-tenant-id"];
    if (typeof header === "string" && header) return header;
    if (!request?.url) return undefined;
    return new URL(request.url, "http://localhost").searchParams.get("tenantId") ?? undefined;
  }
}
