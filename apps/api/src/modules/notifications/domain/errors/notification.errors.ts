export type NotificationNotFound = { type: "NOTIFICATION_NOT_FOUND"; notificationId: string };
export type PreferenceInvalid = { type: "PREFERENCE_INVALID"; reason: string };
export type DeviceTokenInvalid = { type: "DEVICE_TOKEN_INVALID" };
export type NotificationSendFailed = { type: "NOTIFICATION_SEND_FAILED" };
export type NotificationFetchFailed = { type: "NOTIFICATION_FETCH_FAILED" };
export type NotificationDispatchFailed = { type: "NOTIFICATION_DISPATCH_FAILED" };
export type UnknownNotificationType = { type: "UNKNOWN_NOTIFICATION_TYPE"; key: string };

export type NotificationError =
  | NotificationNotFound
  | PreferenceInvalid
  | DeviceTokenInvalid
  | NotificationSendFailed
  | NotificationFetchFailed
  | NotificationDispatchFailed
  | UnknownNotificationType;
