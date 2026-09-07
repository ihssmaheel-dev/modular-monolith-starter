import type { NotificationResponse } from "@repo/contracts";
import type { Notification } from "../domain/entities/notification.entity";

function toIso(value: Date): string {
  return value.toISOString();
}

export function toNotificationResponse(notification: Notification): NotificationResponse {
  const data = notification.toJSON();
  return {
    id: data.id,
    type: data.type,
    category: data.category,
    titleKey: data.titleKey,
    titleParams: (data.titleParams as Record<string, unknown> | null) ?? null,
    data: (data.data as Record<string, unknown> | null) ?? null,
    channels: data.channels,
    readAt: data.readAt ? toIso(data.readAt) : null,
    createdAt: toIso(data.createdAt),
  };
}
