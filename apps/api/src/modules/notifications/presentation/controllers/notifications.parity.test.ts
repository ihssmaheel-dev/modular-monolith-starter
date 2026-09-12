import { notificationsContract } from "@repo/contracts";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import {
  describeRouteParity,
  routePairs,
  type RoutePair,
} from "../../../../common/testing/route-parity";
import { NotificationsController } from "./notifications.controller";
import { NotificationsOrpcController } from "../orpc/notifications.orpc.controller";

const routes: RoutePair[] = routePairs(
  notificationsContract,
  NotificationsOrpcController,
  NotificationsController,
  [
    ["list", "list", "list"],
    ["unreadCount", "unreadCount", "unreadCount"],
    ["markRead", "markRead", "markOneRead"],
    ["markAllRead", "markAllRead", "markAllRead"],
    ["getPreferences", "getPreferences", "getPreferences"],
    ["updatePreferences", "updatePreferences", "putPreferences"],
    ["registerDevice", "registerDevice", "addDevice"],
    ["deleteDevice", "deleteDevice", "deleteDevice"],
  ],
);

describeRouteParity({
  domain: "notifications",
  routes,
  controllers: [[NotificationsController, "NotificationsController"]],
  contract: notificationsContract as unknown as Record<string, AnyContractProcedure>,
  inputlessProcedures: new Set([
    "notifications.unreadCount",
    "notifications.markAllRead",
    "notifications.getPreferences",
    "unreadCount",
    "markAllRead",
    "getPreferences",
  ]),
});
