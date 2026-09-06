import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { FileEntity } from "../../domain/entities/file.entity";
import { FilesRepository } from "../../infrastructure/files.repository";

@Injectable()
export class ListFilesByUploaderQuery {
  constructor(private readonly files: FilesRepository) {}

  async execute(userId: string): Promise<Result<FileEntity[], never>> {
    return ok(await this.files.findByUploader(userId));
  }
}
