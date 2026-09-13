import type { TenantRole } from "@repo/contracts";
import type { Locale } from "@repo/i18n";

export class InvitationCreatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly organizationName: string,
    public readonly email: string,
    public readonly role: Exclude<TenantRole, "owner">,
    public readonly token: string,
    public readonly locale: Locale,
  ) {}
}
