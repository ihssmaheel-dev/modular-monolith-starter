import { randomUUID } from "crypto";
import type { NotificationChannel } from "@repo/contracts";

export interface NotificationData {
  id: string;
  userId: string;
  tenantId?: string | null;
  type: string;
  category: string;
  titleKey: string;
  titleParams?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  channels: NotificationChannel[];
  /** Channels with a confirmed delivery, recorded as each send succeeds. */
  deliveredChannels: NotificationChannel[];
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Notification {
  private constructor(private readonly data: NotificationData) {}

  static create(input: {
    userId: string;
    tenantId?: string;
    type: string;
    category: string;
    titleKey: string;
    titleParams?: Record<string, unknown>;
    data?: Record<string, unknown>;
    channels: NotificationChannel[];
  }): Notification {
    const now = new Date();
    return new Notification({
      id: randomUUID(),
      userId: input.userId,
      tenantId: input.tenantId ?? null,
      type: input.type,
      category: input.category,
      titleKey: input.titleKey,
      titleParams: input.titleParams ?? null,
      data: input.data ?? null,
      channels: input.channels,
      deliveredChannels: [],
      readAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromPersistence(data: NotificationData): Notification {
    return new Notification(data);
  }

  get id() {
    return this.data.id;
  }

  get userId() {
    return this.data.userId;
  }

  get isRead() {
    return this.data.readAt != null;
  }

  markRead(): void {
    this.data.readAt = new Date();
    this.data.updatedAt = new Date();
  }

  toJSON(): NotificationData {
    return { ...this.data };
  }
}
