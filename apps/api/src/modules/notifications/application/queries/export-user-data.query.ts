import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type {
  ExportedBatch,
  ExportedDevice,
  ExportedNotification,
} from "@repo/contracts";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";
import { DeviceTokensRepository } from "../../infrastructure/device-tokens.repository";
import { BatchesRepository } from "../../infrastructure/batches.repository";

const EXPORT_NOTIFICATION_LIMIT = 1000;
const EXPORT_DEVICE_LIMIT = 100;
const EXPORT_BATCH_LIMIT = 100;

export interface ExportedUserNotifications {
  notifications: ExportedNotification[];
  devices: ExportedDevice[];
  batches: ExportedBatch[];
  truncated: boolean;
}

function toIso(value: Date): string {
  return value.toISOString();
}

/** GDPR Art. 15/20 collector: every notification artifact for a subject, bounded. */
@Injectable()
export class ExportUserDataQuery {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly devices: DeviceTokensRepository,
    private readonly batches: BatchesRepository,
  ) {}

  async execute(userId: string): Promise<Result<ExportedUserNotifications, never>> {
    const [rows, tokens, windows] = await Promise.all([
      this.notifications.paginate({ userId }, { page: 1, limit: EXPORT_NOTIFICATION_LIMIT }),
      this.devices.paginate({ userId }, { page: 1, limit: EXPORT_DEVICE_LIMIT }),
      this.batches.paginate({ userId }, { page: 1, limit: EXPORT_BATCH_LIMIT }),
    ]);
    const notifications = rows.isOk() ? rows.value.items : [];
    const deviceRows = tokens.isOk() ? tokens.value.items : [];
    const batchRows = windows.isOk() ? windows.value.items : [];
    return ok({
      notifications: notifications.map((row) => {
        const data = row.toJSON();
        return {
          id: data.id,
          type: data.type,
          category: data.category,
          titleKey: data.titleKey,
          titleParams: (data.titleParams as Record<string, unknown> | null) ?? null,
          data: (data.data as Record<string, unknown> | null) ?? null,
          tenantId: data.tenantId ?? null,
          readAt: data.readAt ? toIso(data.readAt) : null,
          createdAt: toIso(data.createdAt),
        };
      }),
      devices: deviceRows.map((token) => ({
        platform: token.platform,
        provider: token.provider,
        createdAt: toIso(token.createdAt),
      })),
      batches: batchRows.map((window) => ({
        type: window.type,
        groupingKey: window.groupingKey,
        status: window.status,
        items: window.items.map((item) => ({
          titleKey: item.titleKey,
          titleParams: item.titleParams,
          data: item.data,
        })),
        windowEndsAt: toIso(window.windowEndsAt),
      })),
      truncated:
        (rows.isOk() ? rows.value.total : 0) > notifications.length ||
        (tokens.isOk() ? tokens.value.total : 0) > deviceRows.length ||
        (windows.isOk() ? windows.value.total : 0) > batchRows.length,
    });
  }
}
