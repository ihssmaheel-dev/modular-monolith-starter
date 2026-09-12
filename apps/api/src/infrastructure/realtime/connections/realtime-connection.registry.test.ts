import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageEvent as NestMessageEvent } from "@nestjs/common";
import { Subject } from "rxjs";
import type { WebSocket } from "ws";

import type { PinoLoggerService } from "../../logger/logger.service";
import type { MetricsService } from "../../metrics/metrics.service";
import { RealtimeConnectionRegistry } from "./realtime-connection.registry";

const WS_READY_STATE_OPEN = 1;

function createSocket(): WebSocket {
  return { readyState: WS_READY_STATE_OPEN, close: vi.fn(), send: vi.fn() } as unknown as WebSocket;
}

describe("RealtimeConnectionRegistry", () => {
  let metrics: MetricsService;
  let registry: RealtimeConnectionRegistry;

  beforeEach(() => {
    metrics = {
      incrementGauge: vi.fn(),
      decrementGauge: vi.fn(),
    } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    registry = new RealtimeConnectionRegistry(metrics, logger);
  });

  it("tracks a WebSocket connection once and removes it cleanly", () => {
    const socket = createSocket();

    registry.addWsClient("user-1", "tenant-1", socket);
    registry.addWsClient("user-1", "tenant-1", socket);
    registry.removeWsClient("user-1", "tenant-1", socket);

    expect(registry.getUserCount()).toBe(0);
    expect(metrics.incrementGauge).toHaveBeenCalledOnce();
    expect(metrics.decrementGauge).toHaveBeenCalledOnce();
  });

  it("keeps tenant-scoped client events isolated", () => {
    const tenantOneSocket = createSocket();
    const tenantTwoSocket = createSocket();
    registry.addWsClient("user-1", "tenant-1", tenantOneSocket);
    registry.addWsClient("user-1", "tenant-2", tenantTwoSocket);

    registry.dispatchToUser("user-1", "tenant-1", "note.updated", { id: "note-1" });

    expect(tenantOneSocket.send).toHaveBeenCalledOnce();
    expect(tenantTwoSocket.send).not.toHaveBeenCalled();
  });

  it("does not count the same tenant user twice when both transports are connected", () => {
    const socket = createSocket();
    const subject = new Subject<NestMessageEvent>();
    registry.addWsClient("user-1", "tenant-1", socket);
    registry.addSseClient("user-1", "tenant-1", subject);

    expect(registry.getUserCount()).toBe(1);
  });

  it("counts a physical connection once across primary and alias keys (H16)", () => {
    const socket = createSocket();
    registry.addWsClient("user-1", "tenant-1", socket);
    registry.addWsAlias("user-1", socket);

    expect(metrics.incrementGauge).toHaveBeenCalledOnce();
    expect(registry.getUserCount()).toBe(1);

    registry.removeWsClient("user-1", "tenant-1", socket);
    registry.removeWsAlias("user-1", socket);

    expect(metrics.decrementGauge).toHaveBeenCalledOnce();
    expect(registry.getUserCount()).toBe(0);
  });

  it("delivers tenant messages to the scope key and global ones to the alias", () => {
    const socket = createSocket();
    registry.addWsClient("user-1", "tenant-1", socket);
    registry.addWsAlias("user-1", socket);

    registry.dispatchToUser("user-1", "tenant-1", "note.updated", { id: "note-1" });
    registry.dispatchToUser("user-1", undefined, "export.ready", {});

    expect(socket.send).toHaveBeenCalledTimes(2);
  });

  it("never leaks tenant messages to user-global subscribers", () => {
    const globalSocket = createSocket();
    registry.addWsClient("user-1", undefined, globalSocket);

    registry.dispatchToUser("user-1", "tenant-1", "note.updated", { id: "note-1" });

    expect(globalSocket.send).not.toHaveBeenCalled();
  });
});
