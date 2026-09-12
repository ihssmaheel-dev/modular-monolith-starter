import { Injectable, MessageEvent as NestMessageEvent } from "@nestjs/common";
import { WebSocket } from "ws";
import { Subject } from "rxjs";
import { PinoLoggerService } from "../../logger/logger.service";
import { MetricsService } from "../../metrics/metrics.service";
import {
  dispatchToConnection,
  dispatchToEveryConnection,
  closeKeyConnections,
  closeMatchingConnections,
} from "./realtime-connection.dispatcher";

const MAX_CLIENTS_PER_CONNECTION = 100;

@Injectable()
export class RealtimeConnectionRegistry {
  private wsClients = new Map<string, Set<WebSocket>>();
  private sseClients = new Map<string, Set<Subject<NestMessageEvent>>>();
  private logger: PinoLoggerService;

  constructor(
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RealtimeConnectionRegistry" });
  }

  addWsClient(userId: string, tenantId: string | undefined, socket: WebSocket): void {
    const key = connectionKey(userId, tenantId);
    if (!this.wsClients.has(key)) this.wsClients.set(key, new Set());
    const clients = this.wsClients.get(key)!;
    if (clients.has(socket)) return;
    if (clients.size >= MAX_CLIENTS_PER_CONNECTION) {
      this.logger.warn({ userId }, "Max WebSocket connections reached");
      socket.close();
      return;
    }
    clients.add(socket);
    this.metrics.incrementGauge(
      "realtime_active_connections_total",
      "Active realtime connections",
      1,
      { type: "ws" },
    );
  }

  /**
   * Subscribes an already-counted socket to the user-global key without
   * touching gauges: tenant-scoped subscribers must still receive global
   * (tenant-less) messages, but a physical connection is counted once.
   */
  addWsAlias(userId: string, socket: WebSocket): void {
    const key = connectionKey(userId, undefined);
    if (!this.wsClients.has(key)) this.wsClients.set(key, new Set());
    this.wsClients.get(key)!.add(socket);
  }

  removeWsAlias(userId: string, socket: WebSocket): void {
    const clients = this.wsClients.get(connectionKey(userId, undefined));
    if (clients?.delete(socket) && clients.size === 0) {
      this.wsClients.delete(connectionKey(userId, undefined));
    }
  }

  removeWsClient(userId: string, tenantId: string | undefined, socket: WebSocket): void {
    const key = connectionKey(userId, tenantId);
    const clients = this.wsClients.get(key);
    if (clients?.delete(socket)) {
      this.metrics.decrementGauge(
        "realtime_active_connections_total",
        "Active realtime connections",
        1,
        { type: "ws" },
      );
      if (clients.size === 0) this.wsClients.delete(key);
    }
  }

  addSseClient(
    userId: string,
    tenantId: string | undefined,
    subject: Subject<NestMessageEvent>,
  ): void {
    const key = connectionKey(userId, tenantId);
    if (!this.sseClients.has(key)) this.sseClients.set(key, new Set());
    const clients = this.sseClients.get(key)!;
    if (clients.has(subject)) return;
    if (clients.size >= MAX_CLIENTS_PER_CONNECTION) {
      this.logger.warn({ userId }, "Max SSE connections reached");
      subject.complete();
      return;
    }
    clients.add(subject);
    this.metrics.incrementGauge(
      "realtime_active_connections_total",
      "Active realtime connections",
      1,
      { type: "sse" },
    );
  }

  /**
   * SSE counterpart of addWsAlias: same user-global subscription, no gauge
   * change. See addWsAlias for the rationale.
   */
  addSseAlias(userId: string, subject: Subject<NestMessageEvent>): void {
    const key = connectionKey(userId, undefined);
    if (!this.sseClients.has(key)) this.sseClients.set(key, new Set());
    this.sseClients.get(key)!.add(subject);
  }

  removeSseAlias(userId: string, subject: Subject<NestMessageEvent>): void {
    const clients = this.sseClients.get(connectionKey(userId, undefined));
    if (clients?.delete(subject) && clients.size === 0) {
      this.sseClients.delete(connectionKey(userId, undefined));
    }
  }

  removeSseClient(
    userId: string,
    tenantId: string | undefined,
    subject: Subject<NestMessageEvent>,
  ): void {
    const key = connectionKey(userId, tenantId);
    const clients = this.sseClients.get(key);
    if (clients?.delete(subject)) {
      this.metrics.decrementGauge(
        "realtime_active_connections_total",
        "Active realtime connections",
        1,
        { type: "sse" },
      );
      if (clients.size === 0) this.sseClients.delete(key);
    }
  }

  dispatchToUser(
    userId: string,
    tenantId: string | undefined,
    event: string,
    payload: unknown,
  ): void {
    const { droppedSlowClients } = dispatchToConnection(
      this.wsClients,
      this.sseClients,
      connectionKey(userId, tenantId),
      event,
      payload,
    );
    if (droppedSlowClients > 0) {
      this.logger.warn({ userId, droppedSlowClients }, "Skipped slow realtime clients");
    }
  }

  dispatchToAll(event: string, payload: unknown): void {
    dispatchToEveryConnection(this.wsClients, this.sseClients, event, payload);
  }

  disconnectUser(userId: string): number {
    const closedCount = closeMatchingConnections(
      this.wsClients,
      this.sseClients,
      (key) => key.endsWith(`:${userId}`),
      4001,
      "Session invalidated",
    );
    if (closedCount > 0) this.logger.info({ userId, closedCount }, "Disconnected realtime clients");
    return closedCount;
  }

  disconnectTenantUser(tenantId: string, userId: string): number {
    const closedCount = closeKeyConnections(
      this.wsClients,
      this.sseClients,
      connectionKey(userId, tenantId),
      4003,
      "Membership revoked",
    );
    if (closedCount > 0) {
      this.logger.info(
        { tenantId, userId, closedCount },
        "Disconnected revoked tenant user sockets",
      );
    }
    return closedCount;
  }

  disconnectTenant(tenantId: string): number {
    const prefix = `${tenantId}:`;
    const closedCount = closeMatchingConnections(
      this.wsClients,
      this.sseClients,
      (key) => key.startsWith(prefix),
      4004,
      "Organization purged",
    );
    if (closedCount > 0) {
      this.logger.info({ tenantId, closedCount }, "Disconnected purged tenant sockets");
    }
    return closedCount;
  }

  getUserCount(): number {
    // Keys are per scope (`<tenant>:<user>`); aliases mean one user can own
    // several keys, so count distinct users, not keys.
    const users = new Set<string>();
    for (const key of [...this.wsClients.keys(), ...this.sseClients.keys()]) {
      users.add(key.split(":").pop() ?? key);
    }
    return users.size;
  }
}

function connectionKey(userId: string, tenantId?: string): string {
  return `${tenantId ?? "single"}:${userId}`;
}
