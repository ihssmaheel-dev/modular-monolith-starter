import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  RequirePermission,
  Idempotent,
  requireAuthenticatedUser,
  ResponseSchema,
} from "../../../../common";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import {
  type CreateNoteDto,
  type UpdateNoteDto,
  type PaginationQuery,
  type NoteResponseDto,
  type NoteListResponseDto,
  type AttachFileInput,
  type FileMetadataResponse,
  type FileListResponse,
  type NoteAttachmentsQuery,
  CreateNoteSchema,
  UpdateNoteSchema,
  PaginationQuerySchema,
  NoteAttachmentsQuerySchema,
  NoteListResponseSchema,
  NoteResponseSchema,
  EmptyResponseSchema,
  AttachFileSchema,
  FileMetadataSchema,
  FileListResponseSchema,
} from "@repo/contracts";
import { CreateNoteCommand } from "../../application/commands/create-note.command";
import { UpdateNoteCommand } from "../../application/commands/update-note.command";
import { DeleteNoteCommand } from "../../application/commands/delete-note.command";
import { AttachFileToNoteCommand } from "../../application/commands/attach-file-to-note.command";
import { GetNotesQuery } from "../../application/queries/get-notes.query";
import { GetNoteByIdQuery } from "../../application/queries/get-note-by-id.query";
import { ListNoteAttachmentsQuery } from "../../application/queries/list-note-attachments.query";
import { toNoteListResponse, toNoteResponse } from "../mappers/notes.mapper";
import { ATTACH_FILE_ERRORS, NOTE_NOT_FOUND_ERRORS } from "../error-maps/notes.error-maps";
import {
  toFileResponse,
  toFileListResponse,
} from "../../../../common/file-access/file-response.mapper";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { handleResult } from "../../../../common/utils/presentation.utils";

@Controller("notes")
export class NotesController {
  constructor(
    private readonly createNoteCommand: CreateNoteCommand,
    private readonly updateNoteCommand: UpdateNoteCommand,
    private readonly deleteNoteCommand: DeleteNoteCommand,
    private readonly attachFileToNoteCommand: AttachFileToNoteCommand,
    private readonly getNotesQuery: GetNotesQuery,
    private readonly getNoteByIdQuery: GetNoteByIdQuery,
    private readonly listAttachmentsQuery: ListNoteAttachmentsQuery,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @RequirePermission("notes:read")
  @ResponseSchema(NoteListResponseSchema)
  async list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() req: FastifyRequest,
  ): Promise<NoteListResponseDto> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.getNotesQuery.execute({ page, limit }, actor);
    const val = handleResult(result, {}, this.i18n, lang);
    return toNoteListResponse(val);
  }

  @Get(":id")
  @RequirePermission("notes:read")
  @ResponseSchema(NoteResponseSchema)
  async getById(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Req() req: FastifyRequest,
  ): Promise<NoteResponseDto> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.getNoteByIdQuery.execute(id, actor);
    const note = handleResult(
      result,
      {
        NOTE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.note.notFound" },
        NOTE_EVENT_DISPATCH_FAILED: {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          i18nKey: "api.error.eventDispatchFailed",
        },
      },
      this.i18n,
      lang,
    );
    return toNoteResponse(note);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("notes:create")
  @ResponseSchema(NoteResponseSchema)
  async create(
    @Body(new ZodValidationPipe(CreateNoteSchema)) body: CreateNoteDto,
    @Req() req: FastifyRequest,
  ): Promise<NoteResponseDto> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.createNoteCommand.execute(body, actor);
    const note = handleResult(result, {}, this.i18n, lang);
    return toNoteResponse(note);
  }

  @Patch(":id")
  @Idempotent()
  @RequirePermission("notes:update")
  @ResponseSchema(NoteResponseSchema)
  async update(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Body(new ZodValidationPipe(UpdateNoteSchema)) body: UpdateNoteDto,
    @Req() req: FastifyRequest,
  ): Promise<NoteResponseDto> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.updateNoteCommand.execute(id, body, actor);
    const note = handleResult(
      result,
      {
        NOTE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.note.notFound" },
        NOTE_EVENT_DISPATCH_FAILED: {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          i18nKey: "api.error.eventDispatchFailed",
        },
      },
      this.i18n,
      lang,
    );
    return toNoteResponse(note);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent()
  @RequirePermission("notes:delete")
  @ResponseSchema(EmptyResponseSchema)
  async delete(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.deleteNoteCommand.execute(id, actor);
    handleResult(
      result,
      {
        NOTE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.note.notFound" },
        NOTE_EVENT_DISPATCH_FAILED: {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          i18nKey: "api.error.eventDispatchFailed",
        },
      },
      this.i18n,
      lang,
    );
  }

  @Post(":id/attachments")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("notes:update")
  @ResponseSchema(FileMetadataSchema)
  async attachFile(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Body(new ZodValidationPipe(AttachFileSchema)) body: AttachFileInput,
    @Req() req: FastifyRequest,
  ): Promise<FileMetadataResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.attachFileToNoteCommand.execute(id, body.fileId, actor, body.slot);
    const file = handleResult(result, ATTACH_FILE_ERRORS, this.i18n, lang);
    return toFileResponse(file);
  }

  @Get(":id/attachments")
  @RequirePermission("notes:read")
  @ResponseSchema(FileListResponseSchema)
  async listAttachments(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Query(new ZodValidationPipe(NoteAttachmentsQuerySchema)) query: NoteAttachmentsQuery,
    @Req() req: FastifyRequest,
  ): Promise<FileListResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.listAttachmentsQuery.execute(
      id,
      actor,
      Number(query.page ?? 1),
      Number(query.limit ?? 20),
      query.slot,
    );
    const data = handleResult(result, NOTE_NOT_FOUND_ERRORS, this.i18n, lang);
    return toFileListResponse(data);
  }
}
