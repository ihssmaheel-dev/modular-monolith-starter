import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import { randomUUID } from "crypto";
import type { DigestCadence, PreferenceItem } from "@repo/contracts";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { isKnownCategory } from "../../domain/entities/notification-preference.entity";
import type { NotificationError } from "../../domain/errors/notification.errors";
import { PreferencesRepository } from "../../infrastructure/preferences.repository";

const MAX_PREFERENCES = 20;

@Injectable()
export class UpdatePreferencesCommand {
  constructor(
    private readonly preferences: PreferencesRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    userId: string,
    items: PreferenceItem[],
  ): Promise<Result<PreferenceItem[], NotificationError | TransactionError>> {
    if (items.length === 0 || items.length > MAX_PREFERENCES) {
      return err({ type: "PREFERENCE_INVALID", reason: "preferences must list 1-20 categories" });
    }
    if (items.length === 0 || items.length > MAX_PREFERENCES) {
      return err({ type: "PREFERENCE_INVALID", reason: "preferences must list 1-20 categories" });
    }
    const seen = new Set<string>();
    for (const item of items) {
      if (!isKnownCategory(item.category) || seen.has(item.category)) {
        return err({ type: "PREFERENCE_INVALID", reason: `unknown category: ${item.category}` });
      }
      seen.add(item.category);
    }
    const now = new Date();
    const rows = items.map((item) => ({
      id: randomUUID(),
      userId,
      category: item.category,
      inApp: item.inApp,
      email: item.email,
      push: item.push,
      digestCadence: item.digestCadence as DigestCadence,
      createdAt: now,
      updatedAt: now,
    }));
    const operation = async () => {
      await this.preferences.replaceAll(userId, rows);
      return ok(items);
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED"
        ? error
        : ({ type: "PREFERENCE_INVALID", reason: "persist failed" } as const),
    );
  }
}
