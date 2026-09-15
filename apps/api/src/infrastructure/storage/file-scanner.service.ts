import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";
import { StorageService } from "./storage.service";

const AV_SCAN_TIMEOUT_MS = 10_000;
const ScanResponseSchema = z.object({ clean: z.boolean() });

export type FileScanResult = "clean" | "infected";
export type FileScanError = "OBJECT_MISSING" | "SCANNER_UNAVAILABLE" | "SCANNER_INVALID_RESPONSE";

@Injectable()
export class FileScannerService {
  constructor(
    private readonly storage: StorageService,
    private readonly logger: PinoLoggerService,
  ) {}

  async scan(file: {
    key: string;
    fileSize: number;
    contentType: string;
    etag?: string;
    versionId?: string;
  }): Promise<{ result: FileScanResult } | { error: FileScanError }> {
    const metadata = await this.storage.getMetadata(file.key);
    if (metadata.isErr()) return { error: "SCANNER_UNAVAILABLE" };
    if (!metadata.value) return { error: "OBJECT_MISSING" };
    if (!this.matchesExpectedObject(file, metadata.value)) {
      return { error: "OBJECT_MISSING" };
    }
    if (!env.FILE_AV_ENABLED) return { result: "clean" };
    return this.scanWithAv(file.key, file.versionId, file.etag);
  }

  private matchesExpectedObject(
    file: { fileSize: number; contentType: string; etag?: string; versionId?: string },
    metadata: { size: number; contentType?: string; etag?: string; versionId?: string },
  ): boolean {
    if (metadata.size !== file.fileSize || metadata.contentType !== file.contentType) return false;
    if (file.versionId && metadata.versionId !== file.versionId) return false;
    return !file.etag || metadata.etag === file.etag;
  }

  private async scanWithAv(
    key: string,
    versionId?: string,
    etag?: string,
  ): Promise<{ result: FileScanResult } | { error: FileScanError }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AV_SCAN_TIMEOUT_MS);
    try {
      const response = await fetch(env.FILE_AV_URL!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bucket: env.S3_BUCKET, key, versionId, etag }),
        signal: controller.signal,
      });
      if (!response.ok) return { error: "SCANNER_UNAVAILABLE" };
      const parsed = ScanResponseSchema.safeParse(await response.json());
      if (!parsed.success) return { error: "SCANNER_INVALID_RESPONSE" };
      return { result: parsed.data.clean ? "clean" : "infected" };
    } catch (error) {
      this.logger.error({ key, error }, "Antivirus scanner request failed");
      return { error: "SCANNER_UNAVAILABLE" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
