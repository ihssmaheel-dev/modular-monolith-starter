import { privacyContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { PrivacyController } from "./privacy.controller";
import { PrivacyOrpcController } from "../orpc/privacy.orpc.controller";

const routes: RoutePair[] = routePairs(privacyContract, PrivacyOrpcController, PrivacyController, [
  ["requestExport", "requestExport", "export"],
  ["downloadExport", "downloadExport", "download"],
  ["listRequests", "listRequests", "listMine"],
  ["requestAccountErasure", "requestAccountErasure", "eraseAccount"],
  ["requestOrganizationErasure", "requestOrganizationErasure", "eraseOrganization"],
  ["listAllRequests", "listAllRequests", "listAll"],
  ["purgeExpired", "purgeExpired", "purge"],
]);

describeRouteParity({
  domain: "privacy",
  routes,
  controllers: [[PrivacyController, "PrivacyController"]],
  contract: privacyContract as unknown as Record<string, AnyContractProcedure>,
  inputlessProcedures: new Set([
    "privacy.requestExport",
    "privacy.purgeExpired",
    "requestExport",
    "purgeExpired",
  ]),
});
