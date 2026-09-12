import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Optional, OnModuleDestroy } from "@nestjs/common";
import { Server, WebSocket } from "ws";
import { RealtimeService } from "../realtime.service";
import { PinoLoggerService } from "../../../infrastructure/logger/logger.service";
import { clientOrigins, isTrustedOrigin } from "../../../common/utils/origin.utils";
import {
  decodeAccessTokenExpiry,
  verifyAccessToken,
} from "../../../common/utils/access-token.utils";
import { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import { GetUserByIdQuery } from "../../../modules/users/application/queries/get-user-by-id.query";

const WS_READY_STATE_OPEN = 1;
const ACCESS_TOKEN_COOKIE = "access_token";
/** Inbound frames are ping-sized control messages; anything larger is abuse. */
const WS_MAX_INBOUND_BYTES = 64 * 1024;
/** Revalidation sweep cadence for long-lived sockets (expiry + membership). */
const WS_REVALIDATE_INTERVAL_MS = 60_000;
const WS_CLOSE_TOKEN_EXPIRED = 4401;
const WS_CLOSE_MEMBERSHIP_REVOKED = 4403;

interface HandshakeRequest {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface SocketIdentity {
  userId: string;
  tenantId?: string;
  /** Token expiry (ms) decoded at handshake; null when the token carries none. */
  expiresAt: number | null;
}

// Declared handshake origins come from the same trust source as HTTP CORS;
// the handshake below additionally enforces Origin per connection.
@WebSocketGateway({ cors: { origin: clientOrigins() }, maxPayload: WS_MAX_INBOUND_BYTES })
export class RealtimeWebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private socketIdentity = new Map<WebSocket, SocketIdentity>();
  private revalidateTimer?: NodeJS.Timeout;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly tenantAccess: ResolveTenantAccessQuery,
    private readonly logger: PinoLoggerService,
    @Optional() private readonly getUserById?: GetUserByIdQuery,
  ) {}

  afterInit(): void {
    this.revalidateTimer = setInterval(() => {
      void this.revalidateConnections().catch((error) => {
        this.logger.error({ error }, "Realtime revalidation sweep failed");
      });
    }, WS_REVALIDATE_INTERVAL_MS);
    this.revalidateTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.revalidateTimer) clearInterval(this.revalidateTimer);
  }

  async handleConnection(@ConnectedSocket() client: WebSocket, ...args: unknown[]): Promise<void> {
    const request = args[0] as HandshakeRequest | undefined;
    if (!this.isAllowedOrigin(request)) {
      client.close();
      return;
    }
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
    const identity: SocketIdentity = {
      userId: user.sub,
      tenantId: access.value.tenantId,
      expiresAt: token ? decodeAccessTokenExpiry(token) : null,
    };
    this.socketIdentity.set(client, identity);
    this.realtime.addWsClient(identity.userId, identity.tenantId, client);
    this.logger.debug({ userId: identity.userId, tenantId: identity.tenantId }, "WS connected");
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

  /**
   * Long-lived sockets outlive both token expiry and membership changes.
   * The sweep closes expired credentials and re-resolves membership; an
   * empty sweep is the common case and touches no sockets.
   */
  private async revalidateConnections(): Promise<void> {
    if (this.socketIdentity.size === 0) return;
    const now = Date.now();
    for (const [socket, identity] of this.socketIdentity) {
      if (socket.readyState !== WS_READY_STATE_OPEN) {
        this.socketIdentity.delete(socket);
        continue;
      }
      if (identity.expiresAt !== null && identity.expiresAt <= now) {
        this.logger.debug({ userId: identity.userId }, "Closing expired realtime socket");
        socket.close(WS_CLOSE_TOKEN_EXPIRED, "token expired");
        this.socketIdentity.delete(socket);
        continue;
      }
      if (identity.tenantId !== undefined) {
        const access = await this.tenantAccess.execute(identity.userId, identity.tenantId);
        if (access.isErr()) {
          this.logger.debug({ userId: identity.userId }, "Closing revoked realtime socket");
          socket.close(WS_CLOSE_MEMBERSHIP_REVOKED, "membership revoked");
          this.socketIdentity.delete(socket);
        }
      }
    }
  }

  private isAllowedOrigin(request?: HandshakeRequest): boolean {
    const origin = request?.headers?.origin;
    if (typeof origin !== "string" || origin.length === 0) return true;
    return isTrustedOrigin(origin);
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
    if (typeof cookie === "string") {
      const fromCookie = this.readCookie(cookie, ACCESS_TOKEN_COOKIE);
      if (fromCookie) return fromCookie;
    }

    // Browser fallback: the WebSocket constructor cannot set headers, and
    // auth cookies scoped to Path=/api are never sent to /ws. Short-lived
    // access tokens only — never put refresh tokens in URLs.
    if (request?.url) {
      const token = new URL(request.url, "http://localhost").searchParams.get("token");
      if (token) return token;
    }
    return null;
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
