export class ExportRequestedEvent {
  constructor(
    public readonly requestId: string,
    public readonly userId: string,
  ) {}
}

export class ExportReadyEvent {
  constructor(
    public readonly requestId: string,
    public readonly userId: string,
  ) {}
}

export class AccountErasureRequestedEvent {
  constructor(
    public readonly requestId: string,
    public readonly userId: string,
  ) {}
}

export class AccountPurgedEvent {
  constructor(
    public readonly requestId: string,
    public readonly userId: string,
  ) {}
}

export class OrganizationErasureRequestedEvent {
  constructor(
    public readonly requestId: string,
    public readonly tenantId: string,
    public readonly requestedBy: string,
  ) {}
}

export class OrganizationPurgedEvent {
  constructor(
    public readonly requestId: string,
    public readonly tenantId: string,
  ) {}
}
