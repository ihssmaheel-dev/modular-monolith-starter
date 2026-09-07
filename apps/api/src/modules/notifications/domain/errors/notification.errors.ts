export type NotificationNotFound = { type: "NOTIFICATION_NOT_FOUND"; notificationId: string };
export type PreferenceInvalid = { type: "PREFERENCE_INVALID"; reason: string };
export type DeviceTokenInvalid = { type: "DEVICE_TOKEN_INVALID" };
export type NotificationSendFailed = { type: "NOTIFICATION_SEND_FAILED" };
export type NotificationDispatchFailed = { type: "NOTIFICATION_DISPATCH_FAILED" };
export type UnknownNotificationType = { type: "UNKNOWN_NOTIFICATION_TYPE"; key: string };

export type NotificationError =
  | NotificationNotFound
  | PreferenceInvalid
  | DeviceTokenInvalid
  | NotificationSendFailed
  | NotificationDispatchFailed
  | UnknownNotificationType;

export function formatNotificationError(error: NotificationError): string {
  switch (error.type) {
    case "NOTIFICATION_NOT_FOUND":
      return `Notification not found: ${error.notificationId}`;
    case "PREFERENCE_INVALID":
      return `Invalid notification preference: ${error.reason}`;
    case "DEVICE_TOKEN_INVALID":
      return "Invalid device token";
    case "NOTIFICATION_SEND_FAILED":
      return "Notification send failed";
    case "NOTIFICATION_DISPATCH_FAILED":
      return "Notification dispatch failed";
    case "UNKNOWN_NOTIFICATION_TYPE":
      return `Unknown notification type: ${error.key}`;
  }
}
