import { oc } from "@orpc/contract";
import {
  DeviceIdParamSchema,
  DeviceResponseSchema,
  EmptyResponseSchema,
  NotificationIdParamSchema,
  NotificationListResponseSchema,
  NotificationResponseSchema,
  PaginationQuerySchema,
  PreferencesResponseSchema,
  RegisterDeviceSchema,
  UnreadCountResponseSchema,
  UpdatePreferencesSchema,
} from "../schemas";

export const notificationsContract = oc.prefix("/notifications").router({
  list: oc
    .route({ method: "GET", path: "/", summary: "List my notifications" })
    .input(PaginationQuerySchema)
    .output(NotificationListResponseSchema),
  unreadCount: oc
    .route({ method: "GET", path: "/unread-count", summary: "Count my unread notifications" })
    .output(UnreadCountResponseSchema),
  markRead: oc
    .route({ method: "PATCH", path: "/{id}/read", summary: "Mark a notification as read" })
    .input(NotificationIdParamSchema)
    .output(NotificationResponseSchema),
  markAllRead: oc
    .route({ method: "POST", path: "/read-all", summary: "Mark all notifications as read" })
    .output(EmptyResponseSchema),
  getPreferences: oc
    .route({ method: "GET", path: "/preferences", summary: "Get my notification preferences" })
    .output(PreferencesResponseSchema),
  updatePreferences: oc
    .route({ method: "PUT", path: "/preferences", summary: "Update notification preferences" })
    .input(UpdatePreferencesSchema)
    .output(PreferencesResponseSchema),
  registerDevice: oc
    .route({
      method: "POST",
      path: "/devices",
      summary: "Register a push device token",
      successStatus: 201,
    })
    .input(RegisterDeviceSchema)
    .output(DeviceResponseSchema),
  deleteDevice: oc
    .route({
      method: "DELETE",
      path: "/devices/{id}",
      summary: "Delete a push device",
      successStatus: 204,
    })
    .input(DeviceIdParamSchema)
    .output(EmptyResponseSchema),
});
