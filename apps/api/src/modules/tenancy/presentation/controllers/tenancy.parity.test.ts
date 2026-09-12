import { organizationsContract, membershipsContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsOrpcController } from "../orpc/organizations.orpc.controller";
import { MembershipsController } from "./memberships.controller";
import { MembershipsOrpcController } from "../orpc/memberships.orpc.controller";
import { TenancyStatusController } from "./tenancy-status.controller";
import { TenancyStatusOrpcController } from "../orpc/tenancy-status.orpc.controller";

const routes: RoutePair[] = [
  ...routePairs(organizationsContract, OrganizationsOrpcController, OrganizationsController, [
    ["createOrganization", "createOrganization", "create"],
    ["listOrganizations", "listOrganizations", "list"],
  ]),
  ...routePairs(organizationsContract, TenancyStatusOrpcController, TenancyStatusController, [
    ["status", "status", "status"],
  ]),
  ...routePairs(membershipsContract, MembershipsOrpcController, MembershipsController, [
    ["listMembers", "listMembers", "listMemberPage"],
    ["updateMember", "updateMember", "update"],
    ["removeMember", "removeMember", "remove"],
    ["inviteMember", "inviteMember", "invite"],
    ["listInvitations", "listInvitations", "listInvitationPage"],
    ["acceptInvitation", "acceptInvitation", "accept"],
  ]),
];

describeRouteParity({
  domain: "tenancy",
  routes,
  controllers: [
    [OrganizationsController, "OrganizationsController"],
    [MembershipsController, "MembershipsController"],
    [TenancyStatusController, "TenancyStatusController"],
  ],
  contract: {
    ...(organizationsContract as unknown as Record<string, AnyContractProcedure>),
    ...(membershipsContract as unknown as Record<string, AnyContractProcedure>),
  },
  inputlessProcedures: new Set(["organizations.status", "status"]),
});
