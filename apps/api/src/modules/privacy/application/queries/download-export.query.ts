import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser, ExportDownloadResponse } from "@repo/contracts";
import { ExportDownloadResponseSchema } from "@repo/contracts";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";

@Injectable()
export class DownloadExportQuery {
  constructor(private readonly requests: PrivacyRepository) {}

  async execute(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<Result<ExportDownloadResponse, PrivacyError>> {
    const found = await this.requests.findById(id);
    if (found.isErr() || !found.value) return err({ type: "DSR_NOT_FOUND", requestId: id });
    const request = found.value;

    const isOwner = request.subjectUserId === actor.sub;
    const isAdmin = actor.role === "admin";
    if (!isOwner && !isAdmin) return err({ type: "DSR_FORBIDDEN" });
    if (request.type !== "EXPORT") return err({ type: "DSR_NOT_FOUND", requestId: id });
    if (request.status !== "READY" || request.isExpired()) {
      if (request.status === "READY") await this.requests.updateById(id, { status: "EXPIRED" });
      return err({ type: "DSR_EXPIRED", requestId: id });
    }

    const parsed = ExportDownloadResponseSchema.safeParse(request.payload);
    if (!parsed.success) return err({ type: "DSR_EXPIRED", requestId: id });
    return ok(parsed.data);
  }
}
