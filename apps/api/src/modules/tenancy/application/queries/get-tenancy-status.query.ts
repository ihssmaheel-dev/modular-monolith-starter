import { Injectable } from "@nestjs/common";
import { env } from "../../../../config/env";
import type { TenantStatusResponse } from "@repo/contracts";

export const DEFAULT_TENANT_HEADER = "x-tenant-id" as const;

@Injectable()
export class GetTenancyStatusQuery {
  execute(): TenantStatusResponse {
    return { mode: env.TENANCY_MODE, header: DEFAULT_TENANT_HEADER };
  }
}
