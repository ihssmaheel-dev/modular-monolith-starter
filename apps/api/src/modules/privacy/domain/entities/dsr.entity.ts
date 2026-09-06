import { randomUUID } from "crypto";
import type { DsrStatus, DsrType } from "@repo/contracts";

export interface DsrData {
  id: string;
  type: DsrType;
  status: DsrStatus;
  subjectUserId: string;
  tenantId?: string | null;
  payload?: unknown;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DsrRequest {
  private constructor(private readonly data: DsrData) {}

  static request(input: {
    type: DsrType;
    subjectUserId: string;
    tenantId?: string;
    expiresAt?: Date;
  }): DsrRequest {
    const now = new Date();
    return new DsrRequest({
      id: randomUUID(),
      type: input.type,
      status: "REQUESTED",
      subjectUserId: input.subjectUserId,
      tenantId: input.tenantId ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromPersistence(data: DsrData): DsrRequest {
    return new DsrRequest(data);
  }

  get id() {
    return this.data.id;
  }

  get type() {
    return this.data.type;
  }

  get status() {
    return this.data.status;
  }

  get subjectUserId() {
    return this.data.subjectUserId;
  }

  get tenantId() {
    return this.data.tenantId ?? undefined;
  }

  get payload() {
    return this.data.payload;
  }

  get expiresAt() {
    return this.data.expiresAt ?? undefined;
  }

  isExpired(now: Date = new Date()): boolean {
    return !!this.data.expiresAt && this.data.expiresAt.getTime() <= now.getTime();
  }

  markReady(payload: unknown, expiresAt: Date): void {
    this.data.status = "READY";
    this.data.payload = payload;
    this.data.expiresAt = expiresAt;
    this.data.updatedAt = new Date();
  }

  markFulfilled(): void {
    this.data.status = "FULFILLED";
    this.data.payload = null;
    this.data.updatedAt = new Date();
  }

  markExpired(): void {
    this.data.status = "EXPIRED";
    this.data.payload = null;
    this.data.updatedAt = new Date();
  }

  toJSON(): DsrData {
    return { ...this.data };
  }
}
