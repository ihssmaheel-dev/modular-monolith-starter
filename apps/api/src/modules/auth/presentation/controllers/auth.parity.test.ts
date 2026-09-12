import { authContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { AuthController } from "./auth.controller";
import { AuthVerificationController } from "./auth-verification.controller";
import { AuthOrpcController } from "../orpc/auth.orpc.controller";

const routes: RoutePair[] = [
  ...routePairs(authContract, AuthOrpcController, AuthController, [
    ["register", "register", "register"],
    ["login", "login", "login"],
    ["logout", "logout", "logout"],
    ["me", "me", "me"],
    ["refresh", "refresh", "refresh"],
    ["forgotPassword", "forgotPassword", "forgotPassword"],
    ["resetPassword", "resetPassword", "resetPassword"],
  ]),
  ...routePairs(authContract, AuthOrpcController, AuthVerificationController, [
    ["verifyEmail", "verifyEmail", "verifyEmail"],
    ["resendVerification", "resendVerification", "resendVerification"],
  ]),
];

describeRouteParity({
  domain: "auth",
  routes,
  controllers: [
    [AuthController, "AuthController"],
    [AuthVerificationController, "AuthVerificationController"],
  ],
  contract: authContract as unknown as Record<string, AnyContractProcedure>,
  inputlessProcedures: new Set(["auth.logout", "auth.me", "logout", "me"]),
});
