import { Injectable } from "@nestjs/common";
import type { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk" with {
  "resolution-mode": "import",
};
import { env } from "../../../../config/env";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { PushDriver, PushMessage, PushSendResult } from "./push.driver";

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

  private static isExpoToken(token: string): boolean {
    return token.startsWith("ExponentPushToken[") && token.endsWith("]");
  }

  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    const expo = await this.client();
    const results: PushSendResult[] = [];
    const chunks = expo.chunkPushNotifications(
      messages
        .filter((message) => ExpoPushDriver.isExpoToken(message.token))
        .map((message): ExpoPushMessage => ({
          to: message.token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
          priority: "high",
        })),
    );
    const skipped = messages.length - chunks.flat().length;
    for (let i = 0; i < skipped; i += 1) results.push({ status: "invalid-token" });

    for (const chunk of chunks) {
      let tickets: ExpoPushTicket[];
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        this.logger.error({ error }, "Expo push chunk failed");
        for (const _ of chunk) results.push({ status: "failed", reason: "PUSH_REQUEST_FAILED" });
        continue;
      }
      for (const ticket of tickets) {
        if (ticket.status === "ok") {
          results.push({ status: "sent", receiptId: ticket.id });
          continue;
        }
        if (ticket.details?.error === "DeviceNotRegistered") {
          results.push({ status: "invalid-token" });
          continue;
        }
        this.logger.warn({ error: ticket.details?.error }, "Expo push ticket rejected");
        results.push({ status: "failed", reason: ticket.details?.error ?? "PUSH_REJECTED" });
      }
    }
    return results;
  }
}
