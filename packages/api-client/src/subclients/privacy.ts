import type {
  DsrListResponse,
  DsrResponse,
  ExportDownloadResponse,
  RequestAccountErasureInput,
  RequestOrganizationErasureInput,
} from "@repo/contracts";
import {
  DsrListResponseSchema,
  DsrResponseSchema,
  EmptyResponseSchema,
  ExportDownloadResponseSchema,
} from "@repo/contracts";
import type { FetchFn } from "../types";
import { orpcResponse, type OrpcClient } from "../orpc";

export function createPrivacyClient(fetchFn: FetchFn, orpc?: OrpcClient) {
  return {
    requestExport: () =>
      orpc
        ? orpcResponse(() => orpc.privacy.requestExport(), 200, DsrResponseSchema)
        : fetchFn<DsrResponse>("/privacy/export", { method: "POST" }, DsrResponseSchema),
    downloadExport: (id: string) =>
      orpc
        ? orpcResponse(() => orpc.privacy.downloadExport({ id }), 200, ExportDownloadResponseSchema)
        : fetchFn<ExportDownloadResponse>(
            `/privacy/export/${encodeURIComponent(id)}/download`,
            {},
            ExportDownloadResponseSchema,
          ),
    listRequests: (input: { page?: number; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      sp.set("page", String(input.page ?? 1));
      sp.set("limit", String(input.limit ?? 20));
      return orpc
        ? orpcResponse(
            () => orpc.privacy.listRequests({ page: input.page ?? 1, limit: input.limit ?? 20 }),
            200,
            DsrListResponseSchema,
          )
        : fetchFn<DsrListResponse>(`/privacy/requests?${sp.toString()}`, {}, DsrListResponseSchema);
    },
    requestAccountErasure: (body: RequestAccountErasureInput) =>
      orpc
        ? orpcResponse(() => orpc.privacy.requestAccountErasure(body), 201, DsrResponseSchema)
        : fetchFn<DsrResponse>(
            "/privacy/erase-account",
            { method: "POST", body: JSON.stringify(body) },
            DsrResponseSchema,
          ),
    requestOrganizationErasure: (organizationId: string, body: { confirmationName: string }) =>
      orpc
        ? orpcResponse(
            () => orpc.privacy.requestOrganizationErasure({ organizationId, ...body }),
            201,
            DsrResponseSchema,
          )
        : fetchFn<DsrResponse>(
            `/privacy/organizations/${encodeURIComponent(organizationId)}/erase`,
            { method: "POST", body: JSON.stringify(body as RequestOrganizationErasureInput) },
            DsrResponseSchema,
          ),
    purgeExpired: () =>
      orpc
        ? orpcResponse(() => orpc.privacy.purgeExpired(), 200, EmptyResponseSchema)
        : fetchFn<void>("/privacy/admin/purge-expired", { method: "POST" }),
  };
}
