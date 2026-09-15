import { Injectable } from "@nestjs/common";
import { err, ok } from "neverthrow";

import type {
  DataLifecycleContributor,
  LifecycleFailure,
  SubjectLifecycleContext,
} from "../../../../infrastructure/lifecycle/data-lifecycle.types";
import { DatabaseService } from "../../../../infrastructure/database";
import { PurgeUserNotificationsCommand } from "../commands/purge-user-notifications.command";
import { ExportUserDataQuery } from "../queries/export-user-data.query";
import { GetPreferencesQuery } from "../queries/get-preferences.query";

@Injectable()
export class NotificationsLifecycleContributor implements DataLifecycleContributor {
  readonly key = "notifications";

  constructor(
    private readonly exportData: ExportUserDataQuery,
    private readonly preferences: GetPreferencesQuery,
    private readonly purge: PurgeUserNotificationsCommand,
    private readonly database: DatabaseService,
  ) {}

  async exportSubject(context: SubjectLifecycleContext) {
    const [exported, preferences] = await this.database.withSystemScope(() =>
      this.database.runTransaction(() =>
        Promise.all([
          this.exportData.execute(context.actor.sub),
          this.preferences.execute(context.actor.sub),
        ]),
      ),
    );
    if (exported.isErr() || preferences.isErr()) return err(this.failed());
    return ok({
      data: {
        preferences: preferences.value,
        notifications: exported.value.notifications,
        devices: exported.value.devices,
        batches: exported.value.batches,
      },
      truncated: exported.value.truncated,
    });
  }

  async purgeSubject(userId: string) {
    const result = await this.purge.execute(userId);
    return result.isErr() ? err(this.failed()) : ok({ deleted: 0 });
  }

  async purgeTenant(tenantId: string) {
    const result = await this.purge.purgeTenant(tenantId);
    return result.isErr() ? err(this.failed()) : ok({ deleted: 0 });
  }

  private failed(): LifecycleFailure {
    return { type: "LIFECYCLE_CONTRIBUTOR_FAILED", contributor: this.key };
  }
}
