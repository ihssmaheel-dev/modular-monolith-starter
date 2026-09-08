import { Injectable } from "@nestjs/common";
import type { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk" with {
  "resolution-mode": "import",
};
import { env } from "../../../../config/env";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { PushDriver, PushMessage, PushSendResult } from "./push.driver";
import { isExpoPushToken } from "./push.driver";

type PushReceipts = Record<
  string,
  { status: "ok" } | { status: "error"; message: string; details?: { error?: string } }
>;

/** Expo Push Service driver (free, receipts, correct default for an Expo app). */
@Injectable()
export class ExpoPushDriver implements PushDriver {
  readonly provider = "expo";
  private readonly logger: PinoLoggerService;
  private expoPromise: Promise<Expo> | null = null;

  constructor(logger: PinoLoggerService) {
    this.logger = logger.child({ module: "ExpoPushDriver" });
  }

  /** expo-server-sdk ships ESM-only; the api bundle is CommonJS, so load it lazily. */
  private async client(): Promise<Expo> {
    if (!this.expoPromise) {
      this.expoPromise = import("expo-server-sdk").then(({ Expo: ExpoClass }) => {
        const accessToken = env.EXPO_ACCESS_TOKEN;
        return new ExpoClass(accessToken ? { accessToken } : undefined);
      });
    }
    return this.expoPromise;
  }

  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    const expo = await this.client();
    // Preserve input positions: one result per input message, in order.
    const results: Array<PushSendResult | undefined> = new Array(messages.length);
    const sendable: Array<{ index: number; message: ExpoPushMessage }> = [];
    messages.forEach((message, index) => {
      if (!isExpoPushToken(message.token)) {
        results[index] = { status: "invalid-token" };
        return;
      }
      sendable.push({
        index,
        message: {
          to: message.token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
          priority: "high",
        },
      });
    });

    const receiptOwners = new Map<string, number>();
    await this.sendChunks(expo, sendable, results, receiptOwners);
    await this.checkReceipts(expo, receiptOwners, results);
    return results.map((result) => result ?? { status: "failed", reason: "PUSH_REQUEST_FAILED" });
  }

  private async sendChunks(
    expo: Expo,
    sendable: Array<{ index: number; message: ExpoPushMessage }>,
    results: Array<PushSendResult | undefined>,
    receiptOwners: Map<string, number>,
  ): Promise<void> {
    for (const chunk of expo.chunkPushNotifications(sendable.map((entry) => entry.message))) {
      let tickets: ExpoPushTicket[];
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        this.logger.error({ error }, "Expo push chunk failed");
        for (const entry of sendable.splice(0, chunk.length)) {
          results[entry.index] = { status: "failed", reason: "PUSH_REQUEST_FAILED" };
        }
        continue;
      }
      chunk.forEach((_: ExpoPushMessage, offset: number) => {
        const entry = sendable.shift();
        if (!entry) return;
        const ticket = tickets[offset];
        if (!ticket || ticket.status !== "ok") {
          results[entry.index] =
            ticket && ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
              ? { status: "invalid-token" }
              : {
                  status: "failed",
                  reason:
                    ticket && ticket.status === "error"
                      ? (ticket.details?.error ?? "PUSH_REJECTED")
                      : "PUSH_REQUEST_FAILED",
                };
          return;
        }
        if (ticket.id) receiptOwners.set(ticket.id, entry.index);
        results[entry.index] = { status: "sent", receiptId: ticket.id };
      });
    }
  }

  private async checkReceipts(
    expo: Expo,
    receiptOwners: Map<string, number>,
    results: Array<PushSendResult | undefined>,
  ): Promise<void> {
    const receiptIds = [...receiptOwners.keys()];
    for (let offset = 0; offset < receiptIds.length; offset += 100) {
      const batch = receiptIds.slice(offset, offset + 100);
      let receipts: PushReceipts;
      try {
        receipts = (await expo.getPushNotificationReceiptsAsync(batch)) as unknown as PushReceipts;
      } catch (error) {
        this.logger.error({ error }, "Expo push receipts check failed");
        return;
      }
      for (const [receiptId, receipt] of Object.entries(receipts)) {
        if (receipt.status === "ok") continue;
        const index = receiptOwners.get(receiptId);
        if (index === undefined) continue;
        if (receipt.details?.error === "DeviceNotRegistered") {
          results[index] = { status: "invalid-token" };
          continue;
        }
        this.logger.warn({ receiptId, error: receipt.details?.error }, "Push receipt rejected");
      }
    }
  }
}
