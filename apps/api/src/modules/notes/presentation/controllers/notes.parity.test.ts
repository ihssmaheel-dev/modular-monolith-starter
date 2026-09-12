import { notesContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { NotesController } from "./notes.controller";
import { NotesOrpcController } from "../orpc/notes.orpc.controller";

const routes: RoutePair[] = routePairs(notesContract, NotesOrpcController, NotesController, [
  ["list", "list", "list"],
  ["getById", "getById", "getById"],
  ["create", "create", "create"],
  ["update", "update", "update"],
  ["delete", "delete", "delete"],
  ["attachFile", "attachFile", "attachFile"],
  ["listAttachments", "listAttachments", "listAttachments"],
]);

describeRouteParity({
  domain: "notes",
  routes,
  controllers: [[NotesController, "NotesController"]],
  contract: notesContract as unknown as Record<string, AnyContractProcedure>,
});
