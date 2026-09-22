import { type WebSocket } from "ws";

import type { SseClient } from "../transports/sse-connection";

const WS_READY_STATE_OPEN = 1;
const WS_SEND_HIGH_WATERMARK_BYTES = 1_048_576;

type WebSocketClients = Map<string, Set<WebSocket>>;
type SseClients = Map<string, Set<SseClient>>;
type RealtimeClient = WebSocket | SseClient;

export function dispatchToConnection(
  wsClients: WebSocketClients,
  sseClients: SseClients,
  key: string,
  event: string,
  payload: unknown,
): { droppedSlowClients: number } {
  const message = JSON.stringify({ event, payload });
  let droppedSlowClients = 0;
  for (const socket of wsClients.get(key) ?? []) {
    if (socket.readyState !== WS_READY_STATE_OPEN) continue;
    if (socket.bufferedAmount > WS_SEND_HIGH_WATERMARK_BYTES) {
      droppedSlowClients += 1;
      continue;
    }
    socket.send(message);
  }
  for (const client of sseClients.get(key) ?? []) {
    if (!client.send(event, payload)) droppedSlowClients += 1;
  }
  return { droppedSlowClients };
}

export function dispatchToEveryConnection(
  wsClients: WebSocketClients,
  sseClients: SseClients,
  event: string,
  payload: unknown,
): void {
  const message = JSON.stringify({ event, payload });
  const sentSockets = new Set<WebSocket>();
  for (const sockets of wsClients.values()) {
    for (const socket of sockets) {
      if (
        !sentSockets.has(socket) &&
        socket.readyState === WS_READY_STATE_OPEN &&
        socket.bufferedAmount <= WS_SEND_HIGH_WATERMARK_BYTES
      ) {
        socket.send(message);
        sentSockets.add(socket);
      }
    }
  }
  const sentSse = new Set<SseClient>();
  for (const clients of sseClients.values()) {
    for (const client of clients) {
      if (!sentSse.has(client)) {
        client.send(event, payload);
        sentSse.add(client);
      }
    }
  }
}

export function closeKeyConnections(
  wsClients: WebSocketClients,
  sseClients: SseClients,
  key: string,
  code = 4001,
  reason = "Closed",
  onClosed?: (item: RealtimeClient) => boolean | void,
): { ws: number; sse: number } {
  let wsCount = 0;
  let sseCount = 0;
  const ws = wsClients.get(key);
  if (ws) {
    for (const socket of ws) {
      try {
        socket.close(code, reason);
        if (onClosed?.(socket) !== false) wsCount += 1;
      } catch {
        /* transport already closed */
      }
    }
    wsClients.delete(key);
  }
  const sse = sseClients.get(key);
  if (sse) {
    for (const client of sse) {
      try {
        if (onClosed?.(client) !== false) sseCount += 1;
        client.close("server_closed");
      } catch {
        /* transport already closed */
      }
    }
    sseClients.delete(key);
  }
  return { ws: wsCount, sse: sseCount };
}

export function closeMatchingConnections(
  wsClients: WebSocketClients,
  sseClients: SseClients,
  predicate: (key: string) => boolean,
  code = 4001,
  reason = "Closed",
  onClosed?: (item: RealtimeClient) => boolean | void,
): { ws: number; sse: number } {
  const closedWs = new Set<WebSocket>();
  const closedSse = new Set<SseClient>();
  let wsCount = 0;
  let sseCount = 0;
  for (const [key, sockets] of wsClients.entries()) {
    if (!predicate(key)) continue;
    for (const socket of sockets) {
      try {
        if (!closedWs.has(socket)) {
          socket.close(code, reason);
          closedWs.add(socket);
          if (onClosed?.(socket) !== false) wsCount += 1;
        }
      } catch {
        /* transport already closed */
      }
    }
    wsClients.delete(key);
  }
  for (const [key, clients] of sseClients.entries()) {
    if (!predicate(key)) continue;
    for (const client of clients) {
      try {
        if (!closedSse.has(client)) {
          closedSse.add(client);
          if (onClosed?.(client) !== false) sseCount += 1;
          client.close("server_closed");
        }
      } catch {
        /* transport already closed */
      }
    }
    sseClients.delete(key);
  }
  return { ws: wsCount, sse: sseCount };
}
