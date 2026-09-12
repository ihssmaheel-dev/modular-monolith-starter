import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser, CreateOrganizationInput } from "@repo/contracts";
import { DatabaseService } from "../../../../infrastructure/database";
import type { Membership, Organization } from "../../domain/entities/tenancy.entity";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { OrganizationsRepository } from "../../infrastructure/repositories/organizations.repository";

const MAX_SLUG_LENGTH = 50;

export interface CreatedOrganization {
  organization: Organization;
  membership: Membership;
}

@Injectable()
export class CreateOrganizationCommand {
  constructor(
    private readonly organizations: OrganizationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly database: DatabaseService,
  ) {}

  async execute(
    input: CreateOrganizationInput,
    actor: AuthenticatedUser,
  ): Promise<Result<CreatedOrganization, TenancyError>> {
    const slug = input.slug ?? createSlug(input.name);
    const existing = await this.organizations.findBySlug(slug);
    if (existing.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    if (existing.value) return err({ type: "ORGANIZATION_SLUG_TAKEN" });

    const result = await this.database.withSystemScope(() =>
      this.database.withResultTransaction(async () => {
        const organization = await this.organizations.create({
          name: input.name,
          slug,
          createdBy: actor.sub,
        });
        if (organization.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" } as const);
        const membership = await this.memberships.create({
          tenantId: organization.value.data.id,
          userId: actor.sub,
          userEmail: actor.email,
          userName: actor.name ?? actor.email,
          role: "owner",
        });
        if (membership.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" } as const);
        return ok({ organization: organization.value, membership: membership.value });
      }),
    );

    if (result.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    return ok(result.value);
  }
}

function createSlug(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  if (normalized.length >= 3) return normalized;
  return `${normalized || "organization"}-org`.slice(0, MAX_SLUG_LENGTH);
}
