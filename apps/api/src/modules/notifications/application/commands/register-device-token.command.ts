import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { RegisterDeviceInput } from "@repo/contracts";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import type { NotificationError } from "../../domain/errors/notification.errors";
import {
  DeviceTokensRepository,
  type DeviceToken,
} from "../../infrastructure/device-tokens.repository";
import { isExpoPushToken } from "../../infrastructure/push/push.driver";

@Injectable()
export class RegisterDeviceTokenCommand {
  constructor(
    private readonly devices: DeviceTokensRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    userId: string,
    input: RegisterDeviceInput,
  ): Promise<Result<DeviceToken, NotificationError | TransactionError>> {
    if (!isExpoPushToken(input.token)) {
      return err({ type: "DEVICE_TOKEN_INVALID" });
    }
    const operation = async () => {
      const saved = await this.devices.upsertToken({
        userId,
        platform: input.platform,
        provider: input.provider,
        token: input.token,
      });
      if (saved.isErr()) return err({ type: "DEVICE_TOKEN_INVALID" } as const);
      return ok(saved.value);
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? error : { type: "DEVICE_TOKEN_INVALID" as const },
    );
  }

  async deleteDevice(userId: string, id: string): Promise<Result<void, NotificationError>> {
    const removed = await this.devices.deleteByUserAndId(userId, id);
    if (!removed) return err({ type: "DEVICE_TOKEN_INVALID" });
    return ok(undefined);
  }
}
