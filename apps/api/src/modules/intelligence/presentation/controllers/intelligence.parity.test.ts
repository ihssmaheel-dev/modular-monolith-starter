import { intelligenceContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { IntelligenceController } from "./intelligence.controller";
import { IntelligenceOrpcController } from "../orpc/intelligence.orpc.controller";

const routes: RoutePair[] = routePairs(
  intelligenceContract,
  IntelligenceOrpcController,
  IntelligenceController,
  [
    ["chat", "chat", "chat"],
    ["search", "search", "search"],
  ],
);

describeRouteParity({
  domain: "intelligence",
  routes,
  controllers: [[IntelligenceController, "IntelligenceController"]],
  contract: intelligenceContract as unknown as Record<string, AnyContractProcedure>,
});
