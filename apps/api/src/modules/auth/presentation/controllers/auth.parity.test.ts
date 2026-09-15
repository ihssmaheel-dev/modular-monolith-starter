import { authContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import { describe, expect, it } from "vitest";
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { AuthController } from "./auth.controller";
import { AuthVerificationController } from "./auth-verification.controller";
import { AuthOrpcController } from "../orpc/auth.orpc.controller";
import { NO_DATABASE_TRANSACTION_KEY } from "../../../../common";

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

describe.each([
  ["REST register", AuthController.prototype.register],
  ["REST login", AuthController.prototype.login],
  ["oRPC register", AuthOrpcController.prototype.register],
  ["oRPC login", AuthOrpcController.prototype.login],
])("auth transaction boundary: %s", (_name, handler) => {
  it("keeps password work outside the request transaction", () => {
    expect(Reflect.getMetadata(NO_DATABASE_TRANSACTION_KEY, handler)).toBe(true);
  });
});
