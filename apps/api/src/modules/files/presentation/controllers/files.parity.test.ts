import { filesContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { FilesController } from "./files.controller";
import { FilesOrpcController } from "../orpc/files.orpc.controller";

const routes: RoutePair[] = routePairs(filesContract, FilesOrpcController, FilesController, [
  ["requestUpload", "requestUpload", "requestUpload"],
  ["confirmUpload", "confirmUpload", "confirmUpload"],
  ["getDownloadUrl", "getDownloadUrl", "getDownloadUrl"],
  ["getById", "getById", "getById"],
  ["listByParent", "listByParent", "listByParent"],
  ["delete", "delete", "delete"],
]);

describeRouteParity({
  domain: "files",
  routes,
  controllers: [[FilesController, "FilesController"]],
  contract: filesContract as unknown as Record<string, AnyContractProcedure>,
});
