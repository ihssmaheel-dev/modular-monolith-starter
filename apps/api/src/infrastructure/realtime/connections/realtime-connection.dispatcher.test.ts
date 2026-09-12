import { describe, expect, it, vi } from "vitest";
import type { MessageEvent as NestMessageEvent } from "@nestjs/common";
import type { Subject } from "rxjs";
import type { WebSocket } from "ws";

import { dispatchToConnection, dispatchToEveryConnection } from "./realtime-connection.dispatcher";

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSED = 3;

function createSocket(readyState: number, bufferedAmount = 0): WebSocket {
  return { readyState, bufferedAmount, send: vi.fn() } as unknown as WebSocket;
}

function createSubject(): Subject<NestMessageEvent> {
  return { next: vi.fn() } as unknown as Subject<NestMessageEvent>;
}

describe("realtime connection dispatcher", () => {
  it("delivers an event to the requested open WebSocket and SSE clients", () => {
    const openSocket = createSocket(WS_READY_STATE_OPEN);
    const closedSocket = createSocket(WS_READY_STATE_CLOSED);
    const subject = createSubject();
    const wsClients = new Map([["tenant-1:user-1", new Set([openSocket, closedSocket])]]);
    const sseClients = new Map([["tenant-1:user-1", new Set([subject])]]);

    dispatchToConnection(wsClients, sseClients, "tenant-1:user-1", "note.created", { id: "1" });

    expect(openSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ event: "note.created", payload: { id: "1" } }),
    );
    expect(closedSocket.send).not.toHaveBeenCalled();
    expect(subject.next).toHaveBeenCalledWith({ type: "note.created", data: { id: "1" } });
  });

  it("skips slow sockets past the outbound ceiling and reports them (H16)", () => {
    const slowSocket = createSocket(WS_READY_STATE_OPEN, 2 * 1_048_576);
    const wsClients = new Map([["tenant-1:user-1", new Set([slowSocket])]]);
    const sseClients = new Map();

    const { droppedSlowClients } = dispatchToConnection(
      wsClients,
      sseClients,
      "tenant-1:user-1",
      "note.created",
      { id: "1" },
    );

    expect(slowSocket.send).not.toHaveBeenCalled();
    expect(droppedSlowClients).toBe(1);
  });

  it("delivers a broadcast to every connected client", () => {
    const firstSocket = createSocket(WS_READY_STATE_OPEN);
    const secondSocket = createSocket(WS_READY_STATE_OPEN);
    const firstSubject = createSubject();
    const secondSubject = createSubject();
    const wsClients = new Map([
      ["single:user-1", new Set([firstSocket])],
      ["tenant-1:user-2", new Set([secondSocket])],
    ]);
    const sseClients = new Map([
      ["single:user-1", new Set([firstSubject])],
      ["tenant-1:user-2", new Set([secondSubject])],
    ]);

    dispatchToEveryConnection(wsClients, sseClients, "system.ready", { ready: true });

    expect(firstSocket.send).toHaveBeenCalledOnce();
    expect(secondSocket.send).toHaveBeenCalledOnce();
    expect(firstSubject.next).toHaveBeenCalledOnce();
    expect(secondSubject.next).toHaveBeenCalledOnce();
  });
});
