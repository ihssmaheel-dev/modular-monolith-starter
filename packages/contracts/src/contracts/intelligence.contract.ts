import { oc } from "@orpc/contract";
import {
  CreateIntelligenceRunSchema,
  IntelligenceDocumentStatusSchema,
  IntelligenceRunIdParamSchema,
  IntelligenceRunResponseSchema,
} from "../schemas/intelligence.schema";

export const intelligenceContract = oc.prefix("/intelligence").router({
  createRun: oc
    .route({
      method: "POST",
      path: "/runs",
      summary: "Queue an authorized intelligence run",
      successStatus: 202,
    })
    .input(CreateIntelligenceRunSchema)
    .output(IntelligenceRunResponseSchema),
  getRun: oc
    .route({ method: "GET", path: "/runs/{id}", summary: "Get an intelligence run" })
    .input(IntelligenceRunIdParamSchema)
    .output(IntelligenceRunResponseSchema),
  indexDocument: oc
    .route({
      method: "POST",
      path: "/documents/{id}/index",
      summary: "Queue indexing for an authorized document",
      successStatus: 202,
    })
    .input(IntelligenceRunIdParamSchema)
    .output(IntelligenceDocumentStatusSchema),
  getDocumentStatus: oc
    .route({
      method: "GET",
      path: "/documents/{id}/status",
      summary: "Get an intelligence document indexing status",
    })
    .input(IntelligenceRunIdParamSchema)
    .output(IntelligenceDocumentStatusSchema),
});
