import { Injectable } from "@nestjs/common";
import { env } from "../../../../config/env";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { ExpoPushDriver } from "./expo-push.driver";
import type { PushDriver, PushMessage, PushSendResult } from "./push.driver";

class NullPushDriver implements PushDriver {
  readonly provider = "none";

  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    return messages.map(() => ({ status: "failed" as const, reason: "PUSH_PROVIDER_DISABLED" }));
  }
}

/**
 * Push transport factory. `PUSH_PROVIDER=none` (default) fails loudly on first
 * call so missing configuration is never silent; swap to `expo` (or a future
 * FCM driver) without touching call sites.
 */
@Injectable()
export class PushDriverFactory {
  private driver: PushDriver | null = null;

  constructor(private readonly logger: PinoLoggerService) {}

  get(): PushDriver {
    if (this.driver) return this.driver;
    if (env.PUSH_PROVIDER === "expo") {
      this.driver = new ExpoPushDriver(this.logger);
      return this.driver;
    }
    if (env.PUSH_PROVIDER !== "none") {
      this.logger.warn({ provider: env.PUSH_PROVIDER }, "Unknown push provider, push disabled");
    }
    this.driver = new NullPushDriver();
    return this.driver;
  }
}
