import { Controller, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { intelligenceContract } from "@repo/contracts";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import { invokeOrpc } from "../../../../infrastructure/orpc";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import {
  RequirePermission,
  Idempotent,
  NoDatabaseTransaction,
  RateLimit,
} from "../../../../common";
import { IntelligenceController } from "../controllers/intelligence.controller";

@Controller("rpc")
export class IntelligenceOrpcController {
  constructor(
    private readonly controller: IntelligenceController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(intelligenceContract.createRun)
  @NoDatabaseTransaction()
  @Idempotent()
  @RateLimit(10, 60)
  @RequirePermission("intelligence:run")
  createRun(@Req() request: FastifyRequest) {
    return implement(intelligenceContract.createRun).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.create(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(intelligenceContract.getRun)
  @RateLimit(60, 60)
  @RequirePermission("intelligence:run")
  getRun(@Req() request: FastifyRequest) {
    return implement(intelligenceContract.getRun).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.get(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(intelligenceContract.indexDocument)
  @NoDatabaseTransaction()
  @Idempotent()
  @RateLimit(10, 60)
  @RequirePermission("intelligence:index")
  indexDocument(@Req() request: FastifyRequest) {
    return implement(intelligenceContract.indexDocument).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.index(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(intelligenceContract.getDocumentStatus)
  @RateLimit(60, 60)
  @RequirePermission("intelligence:index")
  getDocumentStatus(@Req() request: FastifyRequest) {
    return implement(intelligenceContract.getDocumentStatus).handler(({ input }) =>
      invokeOrpc(
        () => this.controller.status(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
