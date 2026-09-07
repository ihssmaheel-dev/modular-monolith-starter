import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  Idempotent,
  NoDatabaseTransaction,
  RequirePermission,
  requireAuthenticatedUser,
  ResponseSchema,
} from "../../../common";
import { ZodValidationPipe } from "../../../common/pipes/validation.pipe";
import {
  type RequestUploadInput,
  type ConfirmUploadInput,
  type PresignedUrlResponse,
  type FileMetadataResponse,
  type DownloadUrlResponse,
  type FileListResponse,
  RequestUploadSchema,
  ConfirmUploadSchema,
  FileIdParamSchema,
  PaginationQuerySchema,
  PresignedUrlResponseSchema,
  FileMetadataSchema,
  DownloadUrlResponseSchema,
  FileListResponseSchema,
  EmptyResponseSchema,
} from "@repo/contracts";
import { RequestUploadCommand } from "../application/commands/request-upload.command";
import { ConfirmUploadCommand } from "../application/commands/confirm-upload.command";
import { DeleteFileCommand } from "../application/commands/delete-file.command";
import { GetFileByIdQuery } from "../application/queries/get-file-by-id.query";
import { GetFileDownloadUrlQuery } from "../application/queries/get-file-download-url.query";
import { ListFilesByParentQuery } from "../application/queries/list-files-by-parent.query";
import { toFileListResponse, toFileResponse } from "./files.mapper";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { handleResult } from "../../../common/utils/presentation.utils";
import {
  CONFIRM_UPLOAD_ERRORS,
  DELETE_FILE_ERRORS,
  DOWNLOAD_ERRORS,
  FILE_NOT_FOUND_ERRORS,
  REQUEST_UPLOAD_ERRORS,
} from "./files.error-maps";

@Controller("files")
export class FilesController {
  constructor(
    private readonly requestUploadCmd: RequestUploadCommand,
    private readonly confirmUploadCmd: ConfirmUploadCommand,
    private readonly deleteFileCmd: DeleteFileCommand,
    private readonly getFileByIdQuery: GetFileByIdQuery,
    private readonly getDownloadUrlQuery: GetFileDownloadUrlQuery,
    private readonly listFilesQuery: ListFilesByParentQuery,
    private readonly i18n: I18nService,
  ) {}

  @Post("upload-url")
  @HttpCode(HttpStatus.CREATED)
  @NoDatabaseTransaction()
  @Idempotent()
  @RequirePermission("files:upload")
  @ResponseSchema(PresignedUrlResponseSchema)
  async requestUpload(
    @Body(new ZodValidationPipe(RequestUploadSchema)) body: RequestUploadInput,
    @Req() req: FastifyRequest,
  ): Promise<PresignedUrlResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.requestUploadCmd.execute(body, actor);
    return handleResult(result, REQUEST_UPLOAD_ERRORS, this.i18n, lang);
  }

  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  @NoDatabaseTransaction()
  @Idempotent()
  @RequirePermission("files:upload")
  @ResponseSchema(FileMetadataSchema)
  async confirmUpload(
    @Body(new ZodValidationPipe(ConfirmUploadSchema)) body: ConfirmUploadInput,
    @Req() req: FastifyRequest,
  ): Promise<FileMetadataResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.confirmUploadCmd.execute(body.fileKey, actor);
    const file = handleResult(result, CONFIRM_UPLOAD_ERRORS, this.i18n, lang);
    return toFileResponse(file);
  }

  @Get(":id/download-url")
  @NoDatabaseTransaction()
  @RequirePermission("files:read")
  @ResponseSchema(DownloadUrlResponseSchema)
  async getDownloadUrl(
    @Param("id", new ZodValidationPipe(FileIdParamSchema.shape.id)) id: string,
    @Req() req: FastifyRequest,
  ): Promise<DownloadUrlResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.getDownloadUrlQuery.execute(id, actor);
    return handleResult(result, DOWNLOAD_ERRORS, this.i18n, lang);
  }

  @Get(":id")
  @RequirePermission("files:read")
  @ResponseSchema(FileMetadataSchema)
  async getById(
    @Param("id", new ZodValidationPipe(FileIdParamSchema.shape.id)) id: string,
    @Req() req: FastifyRequest,
  ): Promise<FileMetadataResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.getFileByIdQuery.execute(id, actor);
    const file = handleResult(result, FILE_NOT_FOUND_ERRORS, this.i18n, lang);
    return toFileResponse(file);
  }

  @Get()
  @RequirePermission("files:read")
  @ResponseSchema(FileListResponseSchema)
  async listByParent(
    @Query(
      new ZodValidationPipe(
        PaginationQuerySchema.extend({
          parentType: z.enum(["note", "user", "general"]),
          parentId: z.string().min(1).optional(),
          slot: z.string().max(64).optional(),
        }),
      ),
    )
    query: {
      parentType: "note" | "user" | "general";
      parentId?: string;
      slot?: string;
      page: number;
      limit: number;
    },
    @Req() req: FastifyRequest,
  ): Promise<FileListResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.listFilesQuery.execute(
      query.parentType,
      actor,
      query.parentId,
      query.page,
      query.limit,
      query.slot,
    );
    const data = handleResult(result, {}, this.i18n, lang);
    return toFileListResponse(data);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @NoDatabaseTransaction()
  @Idempotent()
  @RequirePermission("files:delete")
  @ResponseSchema(EmptyResponseSchema)
  async delete(
    @Param("id", new ZodValidationPipe(FileIdParamSchema.shape.id)) id: string,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.deleteFileCmd.execute(id, actor);
    handleResult(result, DELETE_FILE_ERRORS, this.i18n, lang);
  }
}
