const path = require("path");
const fs = require("fs");
const { writeFileIfMissing, appendExportIfMissing } = require("./utils");

function generateClient({ clientPath, feature, Feature, featurePlural, FeaturePlural }) {
  const subclientContent = `import type {
  Create${Feature}Dto,
  ${Feature}ListResponseDto,
  ${Feature}ResponseDto,
  PaginationQuery,
  Update${Feature}Dto,
} from "@repo/contracts";
import {
  ${Feature}ListResponseSchema,
  ${Feature}ResponseSchema,
  EmptyResponseSchema,
} from "@repo/contracts";
import type { FetchFn } from "../types";
import { orpcResponse, type OrpcClient } from "../orpc";
import { normalizePagination } from "../utils";

export function create${FeaturePlural}Client(fetchFn: FetchFn, orpc?: OrpcClient) {
  return {
    list: (req: { query?: PaginationQuery } = {}) => {
      if (orpc) {
        return orpcResponse(
          () => orpc.${featurePlural}.list(normalizePagination(req.query)),
          200,
          ${Feature}ListResponseSchema,
        );
      }
      const sp = new URLSearchParams();
      if (req.query?.page) sp.set("page", String(req.query.page));
      if (req.query?.limit) sp.set("limit", String(req.query.limit));
      const qs = sp.toString();
      return fetchFn<${Feature}ListResponseDto>(
        \`/${featurePlural}\${qs ? \`?\${qs}\` : ""}\`,
        {},
        ${Feature}ListResponseSchema,
      );
    },
    getById: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(
            () => orpc.${featurePlural}.getById({ id: req.params.id }),
            200,
            ${Feature}ResponseSchema,
          )
        : fetchFn<${Feature}ResponseDto>(
            \`/${featurePlural}/\${encodeURIComponent(req.params.id)}\`,
            {},
            ${Feature}ResponseSchema,
          ),
    create: (req: { body: Create${Feature}Dto }) =>
      orpc
        ? orpcResponse(() => orpc.${featurePlural}.create(req.body), 201, ${Feature}ResponseSchema)
        : fetchFn<${Feature}ResponseDto>(
            "/${featurePlural}",
            { method: "POST", body: JSON.stringify(req.body) },
            ${Feature}ResponseSchema,
          ),
    update: (req: { params: { id: string }; body: Update${Feature}Dto }) =>
      orpc
        ? orpcResponse(
            () => orpc.${featurePlural}.update({ id: req.params.id, ...req.body }),
            200,
            ${Feature}ResponseSchema,
          )
        : fetchFn<${Feature}ResponseDto>(
            \`/${featurePlural}/\${encodeURIComponent(req.params.id)}\`,
            { method: "PATCH", body: JSON.stringify(req.body) },
            ${Feature}ResponseSchema,
          ),
    delete: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(
            () => orpc.${featurePlural}.delete({ id: req.params.id }),
            204,
            EmptyResponseSchema,
          )
        : fetchFn<void>(\`/${featurePlural}/\${encodeURIComponent(req.params.id)}\`, {
            method: "DELETE",
          }),
  };
}
`;

  writeFileIfMissing(
    path.join(clientPath, "src", "subclients", `${featurePlural}.ts`),
    subclientContent,
  );
  appendExportIfMissing(
    path.join(clientPath, "src", "subclients", "index.ts"),
    `export * from "./${featurePlural}";`,
  );

  const indexPath = path.join(clientPath, "src", "index.ts");
  if (fs.existsSync(indexPath)) {
    let index = fs.readFileSync(indexPath, "utf8");
    const importLine = `  create${FeaturePlural}Client,`;
    if (!index.includes(importLine)) {
      index = index.replace("  createUsersClient,", `  createUsersClient,\n${importLine}`);
    }
    const propertyLine = `    ${featurePlural}: create${FeaturePlural}Client(authenticatedFetch, orpcClient),`;
    if (!index.includes(propertyLine)) {
      index = index.replace(
        "    users: createUsersClient(authenticatedFetch, orpcClient),",
        `    users: createUsersClient(authenticatedFetch, orpcClient),\n${propertyLine}`,
      );
    }
    fs.writeFileSync(indexPath, index, "utf8");
  }
}

module.exports = { generateClient };
