export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type PushSendResult =
  | { status: "sent"; receiptId?: string }
  | { status: "invalid-token" }
  | { status: "failed"; reason: string };

/**
 * Push transport port. Implementations translate to a provider (Expo today,
 * FCM-direct tomorrow) without touching call sites.
 */
export interface PushDriver {
  readonly provider: string;
  send(messages: PushMessage[]): Promise<PushSendResult[]>;
}
