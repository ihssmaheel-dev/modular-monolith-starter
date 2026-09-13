import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import { TenantIdSchema, type AuthenticatedUser, type TenantContext } from "@repo/contracts";
import { env } from "../../config/env";
import { I18nService } from "../../infrastructure/i18n/i18n.service";
import {
  TENANT_ACCESS_RESOLVER_PORT,
  type TenantAccessResolverPort,
} from "../ports/tenant-access-resolver.port";
import { TENANT_AGNOSTIC_KEY } from "../decorators/tenant-agnostic.decorator";

type TenantRequest = {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  tenant?: TenantContext;
  query?: Record<string, unknown>;
};

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TENANT_ACCESS_RESOLVER_PORT)
    private readonly resolver: TenantAccessResolverPort,
    private readonly cls: ClsService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (env.TENANCY_MODE === "single") return this.activate(request, { mode: "single" });
    if (this.isAgnostic(context) || !request.user) return this.activate(request, { mode: "multi" });

    const lang =
      typeof request.headers?.["accept-language"] === "string"
        ? request.headers["accept-language"]
        : undefined;
    const tenantId = this.readTenantId(request);
    if (tenantId && !TenantIdSchema.safeParse(tenantId).success) {
      throw new BadRequestException(this.i18n.t("api.tenancy.invalidTenant", lang));
    }
    const result = await this.resolver.resolveAccess(request.user.sub, tenantId);
    if (result.isErr() && result.error.type === "TENANT_REQUIRED") {
      throw new BadRequestException(this.i18n.t("api.tenancy.tenantRequired", lang));
    }
    if (result.isErr()) throw new ForbiddenException(this.i18n.t("api.error.forbidden", lang));
    return this.activate(request, result.value);
  }

  private isAgnostic(context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean>(TENANT_AGNOSTIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
  }

  private readTenantId(request: TenantRequest): string | undefined {
    const value = request.headers?.["x-tenant-id"];
    const header = Array.isArray(value) ? value[0] : value;
    if (header) return header;
    return typeof value === "string" ? value : undefined;
  }

  private activate(request: TenantRequest, tenant: TenantContext): true {
    request.tenant = tenant;
    this.cls.set("tenantMode", tenant.mode);
    this.cls.set("tenantId", tenant.tenantId);
    this.cls.set("tenantMembershipId", tenant.membershipId);
    this.cls.set("tenantRole", tenant.role);
    this.cls.set("systemScope", false);
    return true;
  }
}
