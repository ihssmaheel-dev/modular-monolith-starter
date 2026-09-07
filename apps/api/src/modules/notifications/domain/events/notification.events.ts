export class NotificationCreatedEvent {
  constructor(
    public readonly notificationId: string,
    public readonly userId: string,
    public readonly type: string,
    public readonly tenantId?: string,
  ) {}
}

export class NotificationDigestReadyEvent {
  constructor(
    public readonly batchId: string,
    public readonly userId: string,
    public readonly type: string,
    public readonly count: number,
  ) {}
}
