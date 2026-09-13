import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { FileEntity } from "../../domain/entities/file.entity";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";

export const MAX_USER_EXPORT_FILES = 1000;

@Injectable()
export class ListFilesByUploaderQuery {
  constructor(private readonly files: FilesRepository) {}

  async execute(
    userId: string,
    limit = MAX_USER_EXPORT_FILES,
  ): Promise<Result<FileEntity[], never>> {
    const safeLimit = Math.min(Math.max(1, limit), MAX_USER_EXPORT_FILES);
    return ok(await this.files.findByUploader(userId, safeLimit));
  }
}
