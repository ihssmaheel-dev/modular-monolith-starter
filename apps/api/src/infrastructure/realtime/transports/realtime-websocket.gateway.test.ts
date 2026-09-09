import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import type { WebSocket } from "ws";

import { verifyAccessToken } from "../../../common/utils/access-token.utils";
import type { PinoLoggerService } from "../../logger/logger.service";
import type { RealtimeService } from "../realtime.service";
import type { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import { RealtimeWebsocketGateway } from "./realtime-websocket.gateway";

vi.mock("../../../config/env", () => ({ env: { CLIENT_URL: "http://localhost:5156" } }));
vi.mock("../../../common/utils/access-token.utils", () => ({ verifyAccessToken: vi.fn() }));

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSED = 3;
const AUTHENTICATED_USER: AuthenticatedUser = {
  sub: "user-1",
  email: "user@example.com",
  role: "user",
};

function createSocket(readyState = WS_READY_STATE_OPEN): WebSocket {
  return { readyState, close: vi.fn(), send: vi.fn() } as unknown as WebSocket;
}

describe("RealtimeWebsocketGateway", () => {
  let realtime: RealtimeService;
  let tenantAccess: ResolveTenantAccessQuery;
  let gateway: RealtimeWebsocketGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    realtime = {
      addWsClient: vi.fn(),
      removeWsClient: vi.fn(),
    } as unknown as RealtimeService;
    tenantAccess = {
      execute: vi.fn().mockResolvedValue(ok({ tenantId: "tenant-1" })),
    } as unknown as ResolveTenantAccessQuery;
    const logger = { debug: vi.fn() } as unknown as PinoLoggerService;
    gateway = new RealtimeWebsocketGateway(realtime, tenantAccess, logger);
  });

  it("authenticates and registers a tenant-scoped WebSocket client", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(AUTHENTICATED_USER);
    const socket = createSocket();

    await gateway.handleConnection(socket, {
      headers: { authorization: "Bearer access-token", "x-tenant-id": "tenant-1" },
    });

    expect(tenantAccess.execute).toHaveBeenCalledWith("user-1", "tenant-1");
    expect(realtime.addWsClient).toHaveBeenCalledWith("user-1", "tenant-1", socket);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated connections before resolving tenant access", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(null);
    const socket = createSocket();

    await gateway.handleConnection(socket, { headers: { authorization: "Bearer invalid" } });

    expect(socket.close).toHaveBeenCalledOnce();
    expect(tenantAccess.execute).not.toHaveBeenCalled();
  });

  it("removes the registered connection when it disconnects", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(AUTHENTICATED_USER);
    const socket = createSocket();
    await gateway.handleConnection(socket, { headers: { cookie: "access_token=cookie-token" } });

    gateway.handleDisconnect(socket);

    expect(realtime.removeWsClient).toHaveBeenCalledWith("user-1", "tenant-1", socket);
  });

  it("responds to pings only while the socket is open", () => {
    const openSocket = createSocket();
    const closedSocket = createSocket(WS_READY_STATE_CLOSED);

    gateway.handlePing(openSocket);
    gateway.handlePing(closedSocket);

    expect(openSocket.send).toHaveBeenCalledWith(JSON.stringify({ event: "pong", payload: null }));
    expect(closedSocket.send).not.toHaveBeenCalled();
  });
});
