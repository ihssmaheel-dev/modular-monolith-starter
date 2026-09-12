import { Controller, Req } from "@nestjs/common";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import type { FastifyRequest } from "fastify";
import { filesContract } from "@repo/contracts";
import { Idempotent, NoDatabaseTransaction, RequirePermission } from "../../../../common";
import { invokeOrpc } from "../../../../infrastructure/orpc";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { FilesController } from "../controllers/files.controller";

@Controller("rpc")
export class FilesOrpcController {
  constructor(
    private readonly filesController: FilesController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(filesContract.requestUpload)
  @NoDatabaseTransaction()
  @Idempotent()
  @RequirePermission("files:upload")
  requestUpload(@Req() request: FastifyRequest) {
    return implement(filesContract.requestUpload).handler(({ input }) =>
      invokeOrpc(
        () => this.filesController.requestUpload(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(filesContract.confirmUpload)
  @NoDatabaseTransaction()
  @Idempotent()
  @RequirePermission("files:upload")
  confirmUpload(@Req() request: FastifyRequest) {
    return implement(filesContract.confirmUpload).handler(({ input }) =>
      invokeOrpc(
        () => this.filesController.confirmUpload(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(filesContract.getDownloadUrl)
  @NoDatabaseTransaction()
  @RequirePermission("files:read")
  getDownloadUrl(@Req() request: FastifyRequest) {
    return implement(filesContract.getDownloadUrl).handler(({ input }) =>
      invokeOrpc(
        () => this.filesController.getDownloadUrl(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(filesContract.getById)
  @RequirePermission("files:read")
  getById(@Req() request: FastifyRequest) {
    return implement(filesContract.getById).handler(({ input }) =>
      invokeOrpc(
        () => this.filesController.getById(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(filesContract.listByParent)
  @RequirePermission("files:read")
  listByParent(@Req() request: FastifyRequest) {
    return implement(filesContract.listByParent).handler(({ input }) =>
      invokeOrpc(
        () => this.filesController.listByParent(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(filesContract.delete)
  @NoDatabaseTransaction()
  @Idempotent()
  @RequirePermission("files:delete")
  delete(@Req() request: FastifyRequest) {
    return implement(filesContract.delete).handler(({ input }) =>
      invokeOrpc(
        () => this.filesController.delete(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
