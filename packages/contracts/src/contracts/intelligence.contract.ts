import { oc } from "@orpc/contract";
import {
  SearchDocumentsRequestSchema,
  SearchDocumentsResponseSchema,
  UnaryChatRequestSchema,
  UnaryChatResponseSchema,
} from "../schemas/intelligence.schema";

export const intelligenceContract = oc.prefix("/intelligence").router({
  chat: oc
    .route({
      method: "POST",
      path: "/chat",
      summary: "Execute synchronous unary chat completion",
    })
    .input(UnaryChatRequestSchema)
    .output(UnaryChatResponseSchema),
  search: oc
    .route({
      method: "POST",
      path: "/search",
      summary: "Perform hybrid RAG document search with tenant isolation",
    })
    .input(SearchDocumentsRequestSchema)
    .output(SearchDocumentsResponseSchema),
});
