import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { AuthenticatedUser, DsrListResponse } from "@repo/contracts";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { toDsrResponse } from "../../presentation/privacy.mapper";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";

@Injectable()
export class ListRequestsQuery {
  constructor(private readonly requests: PrivacyRepository) {}

  async execute(
    actor: AuthenticatedUser,
    page: number,
    limit: number,
    scope: "mine" | "all",
  ): Promise<Result<DsrListResponse, PrivacyError>> {
    const filter = scope === "all" ? {} : { subjectUserId: actor.sub };
    const result = await this.requests.paginate(filter, { page, limit });
    if (result.isErr()) {
      return ok({ requests: [], total: 0, page, limit, totalPages: 1 });
    }
    const val = result.value;
    return ok({
      requests: val.items.map(toDsrResponse),
      total: val.total,
      page: val.page,
      limit: val.limit,
      totalPages: val.totalPages,
    });
  }
}
