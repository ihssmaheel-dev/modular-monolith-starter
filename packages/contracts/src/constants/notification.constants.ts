import type { DigestCadence, NotificationChannel } from "../schemas/notification.schema";

export type NotificationCategory = "account" | "collaboration" | "workspace" | "privacy";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "account",
  "collaboration",
  "workspace",
  "privacy",
];

export interface NotificationTypeDefinition {
  key: string;
  category: NotificationCategory;
  /** Bypass batching and deliver on all enabled channels immediately. */
  critical: boolean;
  /** Channels attempted when the recipient has them enabled. */
  defaultChannels: NotificationChannel[];
  /** Batch window in minutes when the recipient uses digest cadence. 0 = always immediate. */
  digestWindowMinutes: number;
  /** Entity scope for batch grouping keys. `none` batches per user+type only. */
  grouping: "entity" | "none";
  /** Default digest cadence for newly seeded preference rows. */
  defaultCadence: DigestCadence;
}

export const NOTIFICATION_TYPES: NotificationTypeDefinition[] = [
  {
    key: "user.welcome",
    category: "account",
    critical: false,
    defaultChannels: ["inApp"],
    digestWindowMinutes: 0,
    grouping: "none",
    defaultCadence: "realtime",
  },
  {
    key: "tenancy.invitation.received",
    category: "workspace",
    critical: true,
    defaultChannels: ["inApp", "push"],
    digestWindowMinutes: 0,
    grouping: "none",
    defaultCadence: "realtime",
  },
  {
    key: "privacy.export.ready",
    category: "privacy",
    critical: true,
    defaultChannels: ["inApp", "push"],
    digestWindowMinutes: 0,
    grouping: "none",
    defaultCadence: "realtime",
  },
  {
    key: "note.activity",
    category: "collaboration",
    critical: false,
    defaultChannels: ["inApp", "email"],
    digestWindowMinutes: 60,
    grouping: "entity",
    defaultCadence: "hourly",
  },
];

export function getNotificationType(key: string): NotificationTypeDefinition | undefined {
  return NOTIFICATION_TYPES.find((type) => type.key === key);
}
