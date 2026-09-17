import { Injectable } from "@nestjs/common";
import type { TenantContext } from "@repo/contracts";
import { ClsService } from "nestjs-cls";
import { env } from "../../../config/env";

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  get(): TenantContext {
    if (env.TENANCY_MODE === "single") {
      return { mode: "single" };
    }
    return {
      mode: "multi",
      tenantId: this.cls.get("tenantId"),
      membershipId: this.cls.get("tenantMembershipId"),
      role: this.cls.get("tenantRole"),
    };
  }

  isSystemScope(): boolean {
    return this.cls.get("systemScope") === true;
  }

  getRequiredTenantId(): string | null {
    return this.get().tenantId ?? null;
  }

  run<T>(context: TenantContext, callback: () => T): T {
    return this.runWithScope(context, false, callback);
  }

  /** System scope is an internal capability; request data can never enable it. */
  runSystem<T>(context: TenantContext, callback: () => T): T {
    return this.runWithScope(context, true, callback);
  }

  private runWithScope<T>(context: TenantContext, systemScope: boolean, callback: () => T): T {
    const store = {
      ...this.cls.get(),
      tenantMode: systemScope ? env.TENANCY_MODE : context.mode,
      tenantId: context.tenantId,
      tenantMembershipId: context.membershipId,
      tenantRole: context.role,
      systemScope,
    };
    return this.cls.runWith(store, callback);
  }
}
