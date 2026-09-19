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
const MAX_PROCESS_CONNECTIONS = 5_000;
const MAX_CONNECTIONS_PER_TENANT = 500;

@Injectable()
export class RealtimeConnectionRegistry {
  private wsClients = new Map<string, Set<WebSocket>>();
  private sseClients = new Map<string, Set<Subject<NestMessageEvent>>>();
  private totalConnections = 0;
  private tenantConnections = new Map<string, number>();
  private socketTenants = new WeakMap<WebSocket | Subject<NestMessageEvent>, string | undefined>();
  private readonly countedConnections = new WeakSet<object>();
  private logger: PinoLoggerService;

  constructor(
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RealtimeConnectionRegistry" });
  }

  private incrementCounters(
    item: WebSocket | Subject<NestMessageEvent>,
    tenantId: string | undefined,
  ): boolean {
    if (this.countedConnections.has(item)) return false;
    this.countedConnections.add(item);
    this.totalConnections += 1;
    this.socketTenants.set(item, tenantId);
    if (tenantId) {
      this.tenantConnections.set(tenantId, (this.tenantConnections.get(tenantId) ?? 0) + 1);
    }
    return true;
  }

  private decrementCounters(
    item: WebSocket | Subject<NestMessageEvent>,
    tenantId?: string | undefined,
  ): boolean {
    if (!this.countedConnections.delete(item)) return false;
    this.totalConnections = Math.max(0, this.totalConnections - 1);
    const resolvedTenantId = tenantId ?? this.socketTenants.get(item);
    if (resolvedTenantId) {
      const current = this.tenantConnections.get(resolvedTenantId) ?? 0;
      if (current <= 1) {
        this.tenantConnections.delete(resolvedTenantId);
      } else {
        this.tenantConnections.set(resolvedTenantId, current - 1);
      }
    }
    return true;
  }

  addWsClient(userId: string, tenantId: string | undefined, socket: WebSocket): boolean {
    const key = connectionKey(userId, tenantId);
    if (!this.wsClients.has(key)) this.wsClients.set(key, new Set());
    const clients = this.wsClients.get(key)!;
    if (clients.has(socket)) return true;

    if (this.getConnectionCount() >= MAX_PROCESS_CONNECTIONS) {
      this.logger.warn({ userId }, "Max process realtime connections reached");
      this.metrics.incrementCounter(
        "realtime_connections_rejected_total",
        "Total rejected realtime connections",
        1,
        { reason: "process_limit", type: "ws" },
      );
      socket.close(1013, "Try again later");
      return false;
    }

    if (tenantId && this.getTenantConnectionCount(tenantId) >= MAX_CONNECTIONS_PER_TENANT) {
      this.logger.warn({ userId, tenantId }, "Max tenant realtime connections reached");
      this.metrics.incrementCounter(
        "realtime_connections_rejected_total",
        "Total rejected realtime connections",
        1,
        { reason: "tenant_limit", type: "ws" },
      );
      socket.close(1013, "Try again later");
      return false;
    }

    if (clients.size >= MAX_CLIENTS_PER_CONNECTION) {
      this.logger.warn({ userId }, "Max WebSocket connections reached");
      socket.close();
      return false;
    }
    clients.add(socket);
    this.incrementCounters(socket, tenantId);
    this.metrics.incrementGauge("realtime_active_connections", "Active realtime connections", 1, {
      type: "ws",
    });
    return true;
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
    if (clients?.delete(socket) && clients.size === 0) {
      this.wsClients.delete(key);
    }
    if (this.decrementCounters(socket, tenantId)) {
      this.metrics.decrementGauge("realtime_active_connections", "Active realtime connections", 1, {
        type: "ws",
      });
    }
  }

  addSseClient(
    userId: string,
    tenantId: string | undefined,
    subject: Subject<NestMessageEvent>,
  ): boolean {
    const key = connectionKey(userId, tenantId);
    if (!this.sseClients.has(key)) this.sseClients.set(key, new Set());
    const clients = this.sseClients.get(key)!;
    if (clients.has(subject)) return true;

    if (this.getConnectionCount() >= MAX_PROCESS_CONNECTIONS) {
      this.logger.warn({ userId }, "Max process realtime connections reached");
      this.metrics.incrementCounter(
        "realtime_connections_rejected_total",
        "Total rejected realtime connections",
        1,
        { reason: "process_limit", type: "sse" },
      );
      subject.complete();
      return false;
    }

    if (tenantId && this.getTenantConnectionCount(tenantId) >= MAX_CONNECTIONS_PER_TENANT) {
      this.logger.warn({ userId, tenantId }, "Max tenant realtime connections reached");
      this.metrics.incrementCounter(
        "realtime_connections_rejected_total",
        "Total rejected realtime connections",
        1,
        { reason: "tenant_limit", type: "sse" },
      );
      subject.complete();
      return false;
    }

    if (clients.size >= MAX_CLIENTS_PER_CONNECTION) {
      this.logger.warn({ userId }, "Max SSE connections reached");
      subject.complete();
      return false;
    }
    clients.add(subject);
    this.incrementCounters(subject, tenantId);
    this.metrics.incrementGauge("realtime_active_connections", "Active realtime connections", 1, {
      type: "sse",
    });
    return true;
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
    if (clients?.delete(subject) && clients.size === 0) {
      this.sseClients.delete(key);
    }
    if (this.decrementCounters(subject, tenantId)) {
      this.metrics.decrementGauge("realtime_active_connections", "Active realtime connections", 1, {
        type: "sse",
      });
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
    const closed = closeMatchingConnections(
      this.wsClients,
      this.sseClients,
      (key) => key.endsWith(`:${userId}`),
      4001,
      "Session invalidated",
      (item) => this.decrementCounters(item),
    );
    this.recordClosed(closed);
    const closedCount = closed.ws + closed.sse;
    if (closedCount > 0) this.logger.info({ userId, closedCount }, "Disconnected realtime clients");
    return closedCount;
  }

  disconnectTenantUser(tenantId: string, userId: string): number {
    const wsAliasClients = this.wsClients.get(connectionKey(userId, undefined));
    const sseAliasClients = this.sseClients.get(connectionKey(userId, undefined));
    const closed = closeKeyConnections(
      this.wsClients,
      this.sseClients,
      connectionKey(userId, tenantId),
      4003,
      "Membership revoked",
      (item) => {
        if ("send" in item) {
          wsAliasClients?.delete(item as WebSocket);
        } else {
          sseAliasClients?.delete(item as Subject<NestMessageEvent>);
        }
        return this.decrementCounters(item, tenantId);
      },
    );
    if (wsAliasClients && wsAliasClients.size === 0) {
      this.wsClients.delete(connectionKey(userId, undefined));
    }
    if (sseAliasClients && sseAliasClients.size === 0) {
      this.sseClients.delete(connectionKey(userId, undefined));
    }
    this.recordClosed(closed);
    const closedCount = closed.ws + closed.sse;
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
    const closed = closeMatchingConnections(
      this.wsClients,
      this.sseClients,
      (key) => key.startsWith(prefix),
      4004,
      "Organization purged",
      (item) => {
        for (const sockets of this.wsClients.values()) {
          if ("send" in item) sockets.delete(item as WebSocket);
        }
        for (const subjects of this.sseClients.values()) {
          if (!("send" in item)) subjects.delete(item as Subject<NestMessageEvent>);
        }
        return this.decrementCounters(item, tenantId);
      },
    );
    this.recordClosed(closed);
    const closedCount = closed.ws + closed.sse;
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

  getConnectionCount(): number {
    return this.totalConnections;
  }

  getTenantConnectionCount(tenantId: string): number {
    return this.tenantConnections.get(tenantId) ?? 0;
  }

  private recordClosed(closed: { ws: number; sse: number }): void {
    for (const [type, count] of Object.entries(closed)) {
      if (count > 0) {
        this.metrics.decrementGauge(
          "realtime_active_connections",
          "Active realtime connections",
          count,
          { type },
        );
      }
    }
  }
}

function connectionKey(userId: string, tenantId?: string): string {
  return `${tenantId ?? "single"}:${userId}`;
}
