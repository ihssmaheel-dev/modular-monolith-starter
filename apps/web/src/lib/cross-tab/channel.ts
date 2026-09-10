import { isSyncMessage } from "./sync";

export interface BroadcastHandler<T> {
  (message: T): void;
}

export interface BroadcastHandle<T> {
  post(message: T): void;
  subscribe(handler: BroadcastHandler<T>): () => void;
  close(): void;
}

export function canUseBroadcast(): boolean {
  return typeof window !== "undefined" && typeof BroadcastChannel !== "undefined";
}

function noop(): void {}

const noopHandle: BroadcastHandle<never> = {
  post: noop,
  subscribe: () => noop,
  close: noop,
};

/**
 * Typed same-tab-excluded broadcast channel. Messages never echo back to the
 * posting context (platform guarantee), so subscriber loops are impossible.
 * Falls back to a no-op handle during SSR or without BroadcastChannel.
 */
export function createBroadcastChannel<T extends { type: string }>(
  name: string,
): BroadcastHandle<T> {
  if (!canUseBroadcast()) return noopHandle as BroadcastHandle<T>;
  const channel = new BroadcastChannel(name);
  const handlers = new Set<BroadcastHandler<T>>();
  channel.onmessage = (event: MessageEvent) => {
    if (!isSyncMessage(event.data)) return;
    for (const handler of [...handlers]) handler(event.data as T);
  };
  return {
    post: (message) => channel.postMessage(message),
    subscribe: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close: () => {
      handlers.clear();
      channel.close();
    },
  };
}
