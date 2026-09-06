import { DynamicModule, Global, Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { env } from "../../config/env";
import { AcceptInvitationCommand } from "./application/commands/accept-invitation.command";
import { CreateOrganizationCommand } from "./application/commands/create-organization.command";
import { InviteMemberCommand } from "./application/commands/invite-member.command";
import { RemoveMemberCommand } from "./application/commands/remove-member.command";
import { PurgeUserTenancyDataCommand } from "./application/commands/purge-user-tenancy-data.command";
import { DeleteOrganizationDataCommand } from "./application/commands/delete-organization-data.command";
import { HardDeleteOrganizationCommand } from "./application/commands/hard-delete-organization.command";
import { ListInvitationsByEmailQuery } from "./application/queries/list-invitations-by-email.query";
import { UpdateMemberCommand } from "./application/commands/update-member.command";
import { InvitationEmailListener } from "./application/listeners/invitation-email.listener";
import { MembershipUserListener } from "./application/listeners/membership-user.listener";
import { ListInvitationsQuery } from "./application/queries/list-invitations.query";
import { ListMembersQuery } from "./application/queries/list-members.query";
import { ListOrganizationsQuery } from "./application/queries/list-organizations.query";
import { ResolveTenantAccessQuery } from "./application/queries/resolve-tenant-access.query";
import { CanDeleteUserQuery } from "./application/queries/can-delete-user.query";
import { InvitationsRepository } from "./infrastructure/invitations.repository";
import { MembershipsRepository } from "./infrastructure/memberships.repository";
import { OrganizationsRepository } from "./infrastructure/organizations.repository";
import { MembershipsController } from "./presentation/memberships.controller";
import { OrganizationsController } from "./presentation/organizations.controller";
import { TenancyStatusController } from "./presentation/tenancy-status.controller";
import { OutboxModule } from "../../infrastructure/outbox/outbox.module";
import { TenancyStatusOrpcController } from "./presentation/tenancy-status.orpc.controller";
import { OrganizationsOrpcController } from "./presentation/organizations.orpc.controller";
import { MembershipsOrpcController } from "./presentation/memberships.orpc.controller";

const providers = [
  OrganizationsRepository,
  MembershipsRepository,
  InvitationsRepository,
  ResolveTenantAccessQuery,
  CreateOrganizationCommand,
  ListOrganizationsQuery,
  ListMembersQuery,
  ListInvitationsQuery,
  InviteMemberCommand,
  AcceptInvitationCommand,
  UpdateMemberCommand,
  RemoveMemberCommand,
  PurgeUserTenancyDataCommand,
  DeleteOrganizationDataCommand,
  HardDeleteOrganizationCommand,
  ListInvitationsByEmailQuery,
  InvitationEmailListener,
  MembershipUserListener,
  CanDeleteUserQuery,
];

@Global()
@Module({})
export class TenancyModule {
  static forRoot(): DynamicModule {
    const domainControllers =
      env.TENANCY_MODE === "multi"
        ? [
            OrganizationsController,
            MembershipsController,
            OrganizationsOrpcController,
            MembershipsOrpcController,
          ]
        : [];
    return {
      module: TenancyModule,
      imports: [EventEmitterModule, OutboxModule],
      controllers: [TenancyStatusController, TenancyStatusOrpcController, ...domainControllers],
      providers: [
        ...providers,
        TenancyStatusController,
        ...(env.TENANCY_MODE === "multi" ? [OrganizationsController, MembershipsController] : []),
      ],
      exports: [
        ResolveTenantAccessQuery,
        CanDeleteUserQuery,
        ListOrganizationsQuery,
        ListInvitationsByEmailQuery,
        PurgeUserTenancyDataCommand,
        DeleteOrganizationDataCommand,
        HardDeleteOrganizationCommand,
      ],
    };
  }
}
