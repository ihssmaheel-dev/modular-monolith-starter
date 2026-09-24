import { Controller, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { intelligenceContract } from "@repo/contracts";
import { Permissions } from "@repo/authorization";
import { RequirePermission } from "../../../../common";
import { invokeOrpc } from "../../../../infrastructure/orpc";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { IntelligenceController } from "../controllers/intelligence.controller";

@Controller("rpc")
export class IntelligenceOrpcController {
  constructor(
    private readonly intelligenceController: IntelligenceController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(intelligenceContract.chat)
  @RequirePermission(Permissions.AI_INTERACT)
  chat(@Req() request: FastifyRequest) {
    return implement(intelligenceContract.chat).handler(({ input }) =>
      invokeOrpc(
        () => this.intelligenceController.chat(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(intelligenceContract.search)
  @RequirePermission(Permissions.AI_INTERACT)
  search(@Req() request: FastifyRequest) {
    return implement(intelligenceContract.search).handler(({ input }) =>
      invokeOrpc(
        () => this.intelligenceController.search(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
