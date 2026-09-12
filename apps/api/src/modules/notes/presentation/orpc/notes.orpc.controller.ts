import { Controller, Req } from "@nestjs/common";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import type { FastifyRequest } from "fastify";
import { notesContract } from "@repo/contracts";
import { Idempotent, RequirePermission } from "../../../../common";
import { invokeOrpc } from "../../../../infrastructure/orpc";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { NotesController } from "../controllers/notes.controller";

@Controller("rpc")
export class NotesOrpcController {
  constructor(
    private readonly notesController: NotesController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(notesContract.list)
  @RequirePermission("notes:read")
  list(@Req() request: FastifyRequest) {
    return implement(notesContract.list).handler(({ input }) =>
      invokeOrpc(
        () => this.notesController.list(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notesContract.getById)
  @RequirePermission("notes:read")
  getById(@Req() request: FastifyRequest) {
    return implement(notesContract.getById).handler(({ input }) =>
      invokeOrpc(
        () => this.notesController.getById(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notesContract.create)
  @Idempotent()
  @RequirePermission("notes:create")
  create(@Req() request: FastifyRequest) {
    return implement(notesContract.create).handler(({ input }) =>
      invokeOrpc(
        () => this.notesController.create(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notesContract.update)
  @Idempotent()
  @RequirePermission("notes:update")
  update(@Req() request: FastifyRequest) {
    return implement(notesContract.update).handler(({ input }) =>
      invokeOrpc(
        () => this.notesController.update(input.id, input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notesContract.delete)
  @Idempotent()
  @RequirePermission("notes:delete")
  delete(@Req() request: FastifyRequest) {
    return implement(notesContract.delete).handler(({ input }) =>
      invokeOrpc(
        () => this.notesController.delete(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notesContract.attachFile)
  @Idempotent()
  @RequirePermission("notes:update")
  attachFile(@Req() request: FastifyRequest) {
    return implement(notesContract.attachFile).handler(({ input }) =>
      invokeOrpc(
        () => this.notesController.attachFile(input.id, input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notesContract.listAttachments)
  @RequirePermission("notes:read")
  listAttachments(@Req() request: FastifyRequest) {
    return implement(notesContract.listAttachments).handler(({ input }) =>
      invokeOrpc(
        () => this.notesController.listAttachments(input.id, input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
