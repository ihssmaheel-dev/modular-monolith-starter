import type {
  DeviceResponse,
  NotificationListResponse,
  NotificationResponse,
  PaginationQuery,
  PreferencesResponse,
  RegisterDeviceInput,
  UnreadCountResponse,
  UpdatePreferencesInput,
} from "@repo/contracts";
import {
  DeviceResponseSchema,
  EmptyResponseSchema,
  NotificationListResponseSchema,
  NotificationResponseSchema,
  PreferencesResponseSchema,
  UnreadCountResponseSchema,
} from "@repo/contracts";
import type { FetchFn } from "../types";
import { orpcResponse, type OrpcClient } from "../orpc";
import { normalizePagination } from "../utils";

function pageQuery(query?: PaginationQuery): string {
  const sp = new URLSearchParams();
  if (query?.page) sp.set("page", String(query.page));
  if (query?.limit) sp.set("limit", String(query.limit));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function createNotificationsClient(fetchFn: FetchFn, orpc?: OrpcClient) {
  return {
    list: (req: { query?: PaginationQuery } = {}) =>
      orpc
        ? orpcResponse(
            () => orpc.notifications.list(normalizePagination(req.query)),
            200,
            NotificationListResponseSchema,
          )
        : fetchFn<NotificationListResponse>(
            `/notifications${pageQuery(req.query)}`,
            {},
            NotificationListResponseSchema,
          ),
    unreadCount: () =>
      orpc
        ? orpcResponse(() => orpc.notifications.unreadCount(), 200, UnreadCountResponseSchema)
        : fetchFn<UnreadCountResponse>("/notifications/unread-count", {}, UnreadCountResponseSchema),
    markRead: (id: string) =>
      orpc
        ? orpcResponse(() => orpc.notifications.markRead({ id }), 200, NotificationResponseSchema)
        : fetchFn<NotificationResponse>(
            `/notifications/${encodeURIComponent(id)}/read`,
            { method: "PATCH" },
            NotificationResponseSchema,
          ),
    markAllRead: () =>
      orpc
        ? orpcResponse(() => orpc.notifications.markAllRead(), 200, EmptyResponseSchema)
        : fetchFn<void>("/notifications/read-all", { method: "POST" }),
    getPreferences: () =>
      orpc
        ? orpcResponse(() => orpc.notifications.getPreferences(), 200, PreferencesResponseSchema)
        : fetchFn<PreferencesResponse>("/notifications/preferences", {}, PreferencesResponseSchema),
    updatePreferences: (body: UpdatePreferencesInput) =>
      orpc
        ? orpcResponse(() => orpc.notifications.updatePreferences(body), 200, PreferencesResponseSchema)
        : fetchFn<PreferencesResponse>(
            "/notifications/preferences",
            { method: "PUT", body: JSON.stringify(body) },
            PreferencesResponseSchema,
          ),
    registerDevice: (body: RegisterDeviceInput) =>
      orpc
        ? orpcResponse(() => orpc.notifications.registerDevice(body), 201, DeviceResponseSchema)
        : fetchFn<DeviceResponse>(
            "/notifications/devices",
            { method: "POST", body: JSON.stringify(body) },
            DeviceResponseSchema,
          ),
    deleteDevice: (id: string) =>
      orpc
        ? orpcResponse(() => orpc.notifications.deleteDevice({ id }), 204, EmptyResponseSchema)
        : fetchFn<void>(`/notifications/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}
