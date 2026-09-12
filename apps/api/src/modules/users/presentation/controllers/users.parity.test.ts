import { usersContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { UsersController } from "./users.controller";
import { UsersEmailChangeController } from "./users-email-change.controller";
import { UsersOrpcController } from "../orpc/users.orpc.controller";

const routes: RoutePair[] = [
  ...routePairs(usersContract, UsersOrpcController, UsersController, [
    ["list", "list", "list"],
    ["getById", "getById", "getById"],
    ["create", "create", "create"],
    ["update", "update", "update"],
    ["updateMe", "updateMe", "updateMe"],
    ["delete", "delete", "delete"],
    ["attachAvatar", "attachAvatar", "attachAvatar"],
    ["removeAvatar", "removeAvatar", "removeAvatar"],
  ]),
  ...routePairs(usersContract, UsersOrpcController, UsersEmailChangeController, [
    ["requestEmailChange", "requestEmailChange", "requestEmailChange"],
    ["verifyEmailChange", "verifyEmailChange", "verifyEmailChange"],
  ]),
];

describeRouteParity({
  domain: "users",
  routes,
  controllers: [
    [UsersController, "UsersController"],
    [UsersEmailChangeController, "UsersEmailChangeController"],
  ],
  contract: usersContract as unknown as Record<string, AnyContractProcedure>,
  inputlessProcedures: new Set(["users.removeAvatar", "removeAvatar"]),
});
