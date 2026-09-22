import type { ServerResponse } from "node:http";

const MAX_EVENT_BYTES = 12 * 1_024;
const MAX_PENDING_BYTES = 16 * 1_024;
const MAX_PENDING_EVENTS = 64;
const DRAIN_DEADLINE_MS = 15_000;

export type SseCloseReason =
  | "client_closed"
  | "server_closed"
  | "event_too_large"
  | "backlog_bytes"
  | "backlog_events"
  | "drain_timeout"
  | "write_failed";

export interface SseClient {
  readonly kind: "sse";
  readonly closed: boolean;
  readonly queuedBytes: number;
  send(event: string, payload: unknown): boolean;
  close(reason?: SseCloseReason): void;
}

export class SseConnection implements SseClient {
  readonly kind = "sse" as const;
  private readonly queue: Buffer[] = [];
  private pendingBytes = 0;
  private isBlocked = false;
  private isClosed = false;
  private drainTimer?: NodeJS.Timeout;

  constructor(
    private readonly response: ServerResponse,
    private readonly onClosed: (reason: SseCloseReason, queuedBytes: number) => void,
  ) {
    response.once("close", this.handleClientClose);
    response.once("error", this.handleWriteFailure);
  }

  get closed(): boolean {
    return this.isClosed;
  }

  get queuedBytes(): number {
    return this.pendingBytes + this.response.writableLength;
  }

  send(event: string, payload: unknown): boolean {
    if (this.isClosed) return false;
    let frame: Buffer;
    try {
      frame = Buffer.from(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      this.close("write_failed");
      return false;
    }
    if (frame.byteLength > MAX_EVENT_BYTES) {
      this.close("event_too_large");
      return false;
    }
    if (this.queue.length >= MAX_PENDING_EVENTS) {
      this.close("backlog_events");
      return false;
    }
    if (this.queuedBytes + frame.byteLength > MAX_PENDING_BYTES) {
      this.close("backlog_bytes");
      return false;
    }
    if (this.isBlocked) {
      this.queue.push(frame);
      this.pendingBytes += frame.byteLength;
      return true;
    }
    return this.write(frame);
  }

  close(reason: SseCloseReason = "server_closed"): void {
    if (this.isClosed) return;
    this.isClosed = true;
    const queuedBytes = this.queuedBytes;
    this.clearDrainWait();
    this.queue.length = 0;
    this.pendingBytes = 0;
    this.response.removeListener("close", this.handleClientClose);
    this.response.removeListener("error", this.handleWriteFailure);
    if (!this.response.writableEnded) this.response.end();
    this.onClosed(reason, queuedBytes);
  }

  private readonly handleDrain = () => {
    if (this.isClosed) return;
    this.isBlocked = false;
    this.clearDrainWait();
    while (!this.isBlocked && this.queue.length > 0) {
      const frame = this.queue.shift();
      if (!frame) break;
      this.pendingBytes -= frame.byteLength;
      if (!this.write(frame)) break;
    }
  };

  private readonly handleClientClose = () => this.close("client_closed");
  private readonly handleWriteFailure = () => this.close("write_failed");

  private write(frame: Buffer): boolean {
    try {
      const accepted = this.response.write(frame);
      if (!accepted) this.waitForDrain();
      return true;
    } catch {
      this.close("write_failed");
      return false;
    }
  }

  private waitForDrain(): void {
    if (this.isBlocked || this.isClosed) return;
    this.isBlocked = true;
    this.response.once("drain", this.handleDrain);
    this.drainTimer = setTimeout(() => this.close("drain_timeout"), DRAIN_DEADLINE_MS);
    this.drainTimer.unref?.();
  }

  private clearDrainWait(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = undefined;
    this.response.removeListener("drain", this.handleDrain);
  }
}
