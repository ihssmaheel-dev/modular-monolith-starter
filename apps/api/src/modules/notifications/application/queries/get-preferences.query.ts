import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { PreferenceItem } from "@repo/contracts";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import type { NotificationError } from "../../domain/errors/notification.errors";
import { defaultPreferencesForUser } from "../../domain/entities/notification-preference.entity";
import { PreferencesRepository } from "../../infrastructure/preferences.repository";

@Injectable()
export class GetPreferencesQuery {
  constructor(
    private readonly preferences: PreferencesRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    userId: string,
  ): Promise<Result<PreferenceItem[], NotificationError | TransactionError>> {
    const operation = async (): Promise<Result<PreferenceItem[], NotificationError>> => {
      const existing = await this.preferences.findByUser(userId);
      if (existing.isOk() && existing.value.length > 0) {
        return ok(
          existing.value.map((p) => {
            const data = p.toJSON();
            return {
              category: data.category,
              inApp: data.inApp,
              email: data.email,
              push: data.push,
              digestCadence: data.digestCadence,
            };
          }),
        );
      }
      const defaults = defaultPreferencesForUser(userId);
      await this.preferences.upsertDefaults(defaults);
      return ok(
        defaults.map((row) => ({
          category: row.category,
          inApp: row.inApp,
          email: row.email,
          push: row.push,
          digestCadence: row.digestCadence,
        })),
      );
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED"
        ? error
        : ({ type: "NOTIFICATION_FETCH_FAILED" } as const),
    );
  }
}
