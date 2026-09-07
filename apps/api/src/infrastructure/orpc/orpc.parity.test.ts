import "reflect-metadata";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import {
  authContract,
  filesContract,
  membershipsContract,
  notesContract,
  organizationsContract,
  privacyContract,
  usersContract,
} from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import { describe, expect, it } from "vitest";
import { AuthController } from "../../modules/auth/presentation/auth.controller";
import { AuthOrpcController } from "../../modules/auth/presentation/auth.orpc.controller";
import { FilesController } from "../../modules/files/presentation/files.controller";
import { FilesOrpcController } from "../../modules/files/presentation/files.orpc.controller";
import { NotesController } from "../../modules/notes/presentation/notes.controller";
import { NotesOrpcController } from "../../modules/notes/presentation/notes.orpc.controller";
import { UsersController } from "../../modules/users/presentation/users.controller";
import { UsersOrpcController } from "../../modules/users/presentation/users.orpc.controller";
import { MembershipsController } from "../../modules/tenancy/presentation/memberships.controller";
import { MembershipsOrpcController } from "../../modules/tenancy/presentation/memberships.orpc.controller";
import { OrganizationsController } from "../../modules/tenancy/presentation/organizations.controller";
import { OrganizationsOrpcController } from "../../modules/tenancy/presentation/organizations.orpc.controller";
import { PrivacyController } from "../../modules/privacy/presentation/privacy.controller";
import { PrivacyOrpcController } from "../../modules/privacy/presentation/privacy.orpc.controller";
import { RESPONSE_SCHEMA_KEY } from "../../common/decorators/response-schema.decorator";
type RoutePair = {
  contract: AnyContractProcedure;
  rpc: [object, string];
  rest: [object, string];
};
const ROUTES: RoutePair[] = [
  ...authRoutes(),
  ...notesRoutes(),
  ...filesRoutes(),
  ...usersRoutes(),
  ...organizationRoutes(),
  ...membershipRoutes(),
  ...privacyRoutes(),
];
describe("oRPC and REST route parity", () => {
  it.each(ROUTES)("keeps $rpc.1 aligned with its REST controller and contract", (route) => {
    const contractRoute = route.contract["~orpc"].route;
    const restPath = routePath(route.rest[0], route.rest[1]);
    const rpcPath = routePath(route.rpc[0], route.rpc[1]);
    expect(contractRoute.path).toBeDefined();
    expect(contractRoute.method).toBeDefined();
    expect(restPath).toBe(nestPath(contractRoute.path));
    expect(rpcPath).toBe(`/rpc${nestPath(contractRoute.path)}`);
    expect(methodName(route.rest[0], route.rest[1])).toBe(contractRoute.method);
    expect(methodName(route.rpc[0], route.rpc[1])).toBe(contractRoute.method);
    const expectedStatus = contractRoute.successStatus ?? 200;
    expect(successStatus(route.rest[0], route.rest[1])).toBe(expectedStatus);
    expect(successStatus(route.rpc[0], route.rpc[1])).toBe(expectedStatus);
    expect(responseSchema(route.rest[0], route.rest[1])).toBe(route.contract["~orpc"].outputSchema);
  });
});
function routePath(controller: object, method: string): string {
  const type = controller as { prototype: object };
  const classPath = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  const methodPath = Reflect.getMetadata(PATH_METADATA, callback) as string | undefined;
  return normalize([classPath, methodPath].filter(Boolean).join("/"));
}
function responseSchema(controller: object, method: string): unknown {
  const type = controller as { prototype: object };
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  return Reflect.getMetadata(RESPONSE_SCHEMA_KEY, callback);
}
function methodName(controller: object, method: string): string {
  const type = controller as { prototype: object };
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  const value = Reflect.getMetadata(METHOD_METADATA, callback) as RequestMethod;
  return RequestMethod[value];
}
function successStatus(controller: object, method: string): number {
  const type = controller as { prototype: object };
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  return (Reflect.getMetadata(HTTP_CODE_METADATA, callback) as number | undefined) ?? 200;
}
function normalize(path?: string): string {
  return `/${(path ?? "").replace(/^\/+|\/+$/g, "")}`.replace(/\/+/g, "/");
}
function nestPath(path?: string): string {
  return normalize(path).replace(/\{([^}]+)\}/g, ":$1");
}
function authRoutes(): RoutePair[] {
  return routePairs(authContract, AuthOrpcController, AuthController, [
    ["register", "register", "register"],
    ["login", "login", "login"],
    ["logout", "logout", "logout"],
    ["me", "me", "me"],
    ["refresh", "refresh", "refresh"],
    ["forgotPassword", "forgotPassword", "forgotPassword"],
    ["resetPassword", "resetPassword", "resetPassword"],
  ]);
}
function notesRoutes(): RoutePair[] {
  return routePairs(notesContract, NotesOrpcController, NotesController, [
    ["list", "list", "list"],
    ["getById", "getById", "getById"],
    ["create", "create", "create"],
    ["update", "update", "update"],
    ["delete", "delete", "delete"],
    ["attachFile", "attachFile", "attachFile"],
  ]);
}
function filesRoutes(): RoutePair[] {
  return routePairs(filesContract, FilesOrpcController, FilesController, [
    ["requestUpload", "requestUpload", "requestUpload"],
    ["confirmUpload", "confirmUpload", "confirmUpload"],
    ["getDownloadUrl", "getDownloadUrl", "getDownloadUrl"],
    ["getById", "getById", "getById"],
    ["listByParent", "listByParent", "listByParent"],
    ["delete", "delete", "delete"],
  ]);
}
function usersRoutes(): RoutePair[] {
  return routePairs(usersContract, UsersOrpcController, UsersController, [
    ["list", "list", "list"],
    ["getById", "getById", "getById"],
    ["create", "create", "create"],
    ["update", "update", "update"],
    ["delete", "delete", "delete"],
    ["attachAvatar", "attachAvatar", "attachAvatar"],
    ["removeAvatar", "removeAvatar", "removeAvatar"],
  ]);
}
function organizationRoutes(): RoutePair[] {
  return routePairs(organizationsContract, OrganizationsOrpcController, OrganizationsController, [
    ["createOrganization", "createOrganization", "create"],
    ["listOrganizations", "listOrganizations", "list"],
  ]);
}
function membershipRoutes(): RoutePair[] {
  return routePairs(membershipsContract, MembershipsOrpcController, MembershipsController, [
    ["listMembers", "listMembers", "listMemberPage"],
    ["updateMember", "updateMember", "update"],
    ["removeMember", "removeMember", "remove"],
    ["inviteMember", "inviteMember", "invite"],
    ["listInvitations", "listInvitations", "listInvitationPage"],
    ["acceptInvitation", "acceptInvitation", "accept"],
  ]);
}
function privacyRoutes(): RoutePair[] {
  return routePairs(privacyContract, PrivacyOrpcController, PrivacyController, [
    ["requestExport", "requestExport", "export"],
    ["downloadExport", "downloadExport", "download"],
    ["listRequests", "listRequests", "listMine"],
    ["requestAccountErasure", "requestAccountErasure", "eraseAccount"],
    ["requestOrganizationErasure", "requestOrganizationErasure", "eraseOrganization"],
    ["listAllRequests", "listAllRequests", "listAll"],
    ["purgeExpired", "purgeExpired", "purge"],
  ]);
}
function routePairs(
  contract: Record<string, RoutePair["contract"]>,
  rpcController: object,
  restController: object,
  names: [string, string, string][],
): RoutePair[] {
  return names.map(([contractName, rpcMethod, restMethod]) => ({
    contract: contract[contractName] ?? missingContract(contractName),
    rpc: [rpcController, rpcMethod],
    rest: [restController, restMethod],
  }));
}

function missingContract(name: string): AnyContractProcedure {
  throw new Error(`Missing contract procedure: ${name}`);
}
