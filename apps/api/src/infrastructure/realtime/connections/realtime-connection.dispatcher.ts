import { type MessageEvent as NestMessageEvent } from "@nestjs/common";
import { type Subject } from "rxjs";
import { type WebSocket } from "ws";

const WS_READY_STATE_OPEN = 1;
/**
 * Per-socket outbound ceiling: a client that cannot keep up stops receiving
 * (it refetches durable state on reconnect) instead of growing server memory
 * without bound. Realtime is a hint channel, never the source of truth.
 */
const WS_SEND_HIGH_WATERMARK_BYTES = 1_048_576;

type WebSocketClients = Map<string, Set<WebSocket>>;
type SseClients = Map<string, Set<Subject<NestMessageEvent>>>;

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
  for (const subject of sseClients.get(key) ?? []) {
    subject.next({ type: event, data: payload } as NestMessageEvent);
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
  const sentSubjects = new Set<Subject<NestMessageEvent>>();
  for (const subjects of sseClients.values()) {
    for (const subject of subjects) {
      if (!sentSubjects.has(subject)) {
        subject.next({ type: event, data: payload } as NestMessageEvent);
        sentSubjects.add(subject);
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
  onClosed?: (item: WebSocket | Subject<NestMessageEvent>) => boolean | void,
): { ws: number; sse: number } {
  let wsCount = 0;
  let sseCount = 0;
  const ws = wsClients.get(key);
  if (ws) {
    for (const s of ws) {
      try {
        s.close(code, reason);
        if (onClosed?.(s) !== false) wsCount += 1;
      } catch {
        /* ignore */
      }
    }
    wsClients.delete(key);
  }
  const sse = sseClients.get(key);
  if (sse) {
    for (const sub of sse) {
      try {
        sub.complete();
        if (onClosed?.(sub) !== false) sseCount += 1;
      } catch {
        /* ignore */
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
  onClosed?: (item: WebSocket | Subject<NestMessageEvent>) => boolean | void,
): { ws: number; sse: number } {
  const closedWs = new Set<WebSocket>();
  const closedSse = new Set<Subject<NestMessageEvent>>();
  let wsCount = 0;
  let sseCount = 0;
  for (const [key, sockets] of wsClients.entries()) {
    if (predicate(key)) {
      for (const s of sockets) {
        try {
          if (!closedWs.has(s)) {
            s.close(code, reason);
            closedWs.add(s);
            if (onClosed?.(s) !== false) wsCount += 1;
          }
        } catch {
          /* ignore */
        }
      }
      wsClients.delete(key);
    }
  }
  for (const [key, subjects] of sseClients.entries()) {
    if (predicate(key)) {
      for (const sub of subjects) {
        try {
          if (!closedSse.has(sub)) {
            sub.complete();
            closedSse.add(sub);
            if (onClosed?.(sub) !== false) sseCount += 1;
          }
        } catch {
          /* ignore */
        }
      }
      sseClients.delete(key);
    }
  }
  return { ws: wsCount, sse: sseCount };
}
