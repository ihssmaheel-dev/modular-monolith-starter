import { z } from "zod";
import { PaginationQuerySchema } from "./pagination.schema";

export const NotificationChannelSchema = z.enum(["inApp", "email", "push"]);
export const DigestCadenceSchema = z.enum(["realtime", "hourly", "daily"]);
export const DevicePlatformSchema = z.enum(["ios", "android", "web"]);
export const DeviceProviderSchema = z.enum(["expo"]);

export const NotificationIdParamSchema = z.object({
  id: z.string().min(1),
});

export const NotificationResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  category: z.string(),
  titleKey: z.string(),
  titleParams: z.record(z.string(), z.unknown()).nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  channels: z.array(NotificationChannelSchema),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().positive(),
});

export const UnreadCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const PreferenceItemSchema = z.object({
  category: z.string().min(1),
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
  digestCadence: DigestCadenceSchema,
});

export const PreferencesResponseSchema = z.object({
  preferences: z.array(PreferenceItemSchema),
});

export const UpdatePreferencesSchema = z.object({
  preferences: z.array(PreferenceItemSchema).min(1).max(20),
});

export const RegisterDeviceSchema = z.object({
  platform: DevicePlatformSchema,
  provider: DeviceProviderSchema.default("expo"),
  token: z.string().min(1).max(1024),
});

export const DeviceResponseSchema = z.object({
  id: z.string(),
  platform: DevicePlatformSchema,
  provider: DeviceProviderSchema,
  createdAt: z.string().datetime(),
});

export const DeviceIdParamSchema = z.object({
  id: z.string().min(1),
});

export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type DigestCadence = z.infer<typeof DigestCadenceSchema>;
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;
export type DeviceProvider = z.infer<typeof DeviceProviderSchema>;
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;
export type PreferencesResponse = z.infer<typeof PreferencesResponseSchema>;
export type PreferenceItem = z.infer<typeof PreferenceItemSchema>;
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesSchema>;
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;
export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;
export type NotificationsPaginationQuery = z.infer<typeof PaginationQuerySchema>;
