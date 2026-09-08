import { randomUUID } from "crypto";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  type NotificationCategory,
} from "@repo/contracts";
import type { DigestCadence, NotificationChannel } from "@repo/contracts";

export interface NotificationPreferenceData {
  id: string;
  userId: string;
  category: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  digestCadence: DigestCadence;
  createdAt: Date;
  updatedAt: Date;
}

export function defaultPreferencesForUser(userId: string): NotificationPreferenceData[] {
  const now = new Date();
  return NOTIFICATION_CATEGORIES.map((category) => ({
    id: randomUUID(),
    userId,
    category,
    inApp: true,
    email: true,
    push: true,
    digestCadence: defaultCadenceForCategory(category),
    createdAt: now,
    updatedAt: now,
  }));
}

function defaultCadenceForCategory(category: string): DigestCadence {
  const definition = NOTIFICATION_TYPES.find((type) => type.category === category);
  return definition?.defaultCadence ?? "realtime";
}

export class NotificationPreference {
  private constructor(private readonly data: NotificationPreferenceData) {}

  static fromPersistence(data: NotificationPreferenceData): NotificationPreference {
    return new NotificationPreference(data);
  }

  get category() {
    return this.data.category;
  }

  isChannelEnabled(channel: NotificationChannel): boolean {
    return this.data[channel] === true;
  }

  get digestCadence(): DigestCadence {
    return this.data.digestCadence;
  }

  toJSON(): NotificationPreferenceData {
    return { ...this.data };
  }
}

export function isKnownCategory(category: string): category is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as string[]).includes(category);
}
