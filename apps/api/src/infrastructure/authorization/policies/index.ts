import type { Policy } from "@repo/authorization";
import { genericTenantAdminPolicy } from "./tenant-admin.policy";

export { createOwnershipPolicy } from "./ownership.policy";
export { genericTenantAdminPolicy } from "./tenant-admin.policy";

export const defaultFoundationalPolicies: Policy[] = [genericTenantAdminPolicy];
