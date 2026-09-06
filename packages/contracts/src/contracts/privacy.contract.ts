import { oc } from "@orpc/contract";
import {
  DsrIdParamSchema,
  DsrListResponseSchema,
  DsrResponseSchema,
  EmptyResponseSchema,
  ExportDownloadResponseSchema,
  PrivacyListQuerySchema,
  RequestAccountErasureSchema,
  RequestOrganizationErasureSchema,
} from "../schemas";
import { PaginationQuerySchema } from "../schemas/pagination.schema";

export const privacyContract = oc.prefix("/privacy").router({
  requestExport: oc
    .route({ method: "POST", path: "/export", summary: "Request a copy of my data" })
    .output(DsrResponseSchema),
  downloadExport: oc
    .route({ method: "GET", path: "/export/{id}/download", summary: "Download my data export" })
    .input(DsrIdParamSchema)
    .output(ExportDownloadResponseSchema),
  listRequests: oc
    .route({ method: "GET", path: "/requests", summary: "List my privacy requests" })
    .input(PrivacyListQuerySchema)
    .output(DsrListResponseSchema),
  requestAccountErasure: oc
    .route({
      method: "POST",
      path: "/erase-account",
      summary: "Request erasure of my account",
      successStatus: 201,
    })
    .input(RequestAccountErasureSchema)
    .output(DsrResponseSchema),
  requestOrganizationErasure: oc
    .route({
      method: "POST",
      path: "/organizations/{organizationId}/erase",
      summary: "Request erasure of an organization",
      successStatus: 201,
    })
    .input(RequestOrganizationErasureSchema)
    .output(DsrResponseSchema),
  listAllRequests: oc
    .route({ method: "GET", path: "/admin/requests", summary: "List all privacy requests" })
    .input(PaginationQuerySchema)
    .output(DsrListResponseSchema),
  purgeExpired: oc
    .route({
      method: "POST",
      path: "/admin/purge-expired",
      summary: "Purge expired erasure requests",
    })
    .output(EmptyResponseSchema),
});
