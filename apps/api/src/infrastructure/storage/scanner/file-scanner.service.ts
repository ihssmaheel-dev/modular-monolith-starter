import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import { z } from "zod";
import { env } from "../../../config/env";
import { PinoLoggerService } from "../../logger/logger.service";
import { StorageService } from "../storage.service";

import { validateMagicBytes } from "../../../common/utils/magic-bytes.utils";

const AV_SCAN_TIMEOUT_MS = 10_000;
const HEADER_SAMPLE_BYTES = 4096;
const HEADER_READ_TIMEOUT_MS = 10_000;
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

    // Sample the exact object verified above, not whichever bytes a reusable
    // presigned URL may have overwritten between HEAD and GET.
    const streamResult = await this.storage.getDownloadStream(file.key, {
      etag: metadata.value.etag,
      versionId: metadata.value.versionId,
      range: `bytes=0-${HEADER_SAMPLE_BYTES - 1}`,
    });
    if (streamResult.isErr()) return { error: "SCANNER_UNAVAILABLE" };
    let chunk: Buffer;
    try {
      chunk = await this.readHeaderBytes(streamResult.value, HEADER_SAMPLE_BYTES);
    } catch (error) {
      this.logger.error({ key: file.key, error }, "File header sampling failed");
      return { error: "SCANNER_UNAVAILABLE" };
    }
    if (!validateMagicBytes(chunk, file.contentType)) {
      this.logger.warn(
        { key: file.key, contentType: file.contentType },
        "File magic bytes do not match declared content-type",
      );
      return { result: "infected" };
    }

    if (!env.FILE_AV_ENABLED) return { result: "clean" };
    return this.scanWithAv(file.key, file.versionId, file.etag);
  }

  private readHeaderBytes(stream: Readable, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let completed = false;

      const cleanup = () => {
        clearTimeout(timeout);
        stream.removeListener("data", onData);
        stream.removeListener("end", onEnd);
        stream.removeListener("error", onError);
        stream.removeListener("close", onClose);
      };

      const onData = (chunk: Buffer) => {
        if (completed) return;
        const sample = chunk.subarray(0, maxBytes - total);
        chunks.push(sample);
        total += sample.length;
        if (total >= maxBytes) {
          completed = true;
          cleanup();
          stream.destroy();
          resolve(Buffer.concat(chunks, total));
        }
      };

      const onEnd = () => {
        if (completed) return;
        completed = true;
        cleanup();
        resolve(Buffer.concat(chunks));
      };

      const onError = (err: unknown) => {
        if (completed) return;
        completed = true;
        cleanup();
        stream.destroy();
        reject(err);
      };

      const onClose = () => onError(new Error("File header stream closed before completion"));
      const timeout = setTimeout(
        () => onError(new Error("File header read timed out")),
        HEADER_READ_TIMEOUT_MS,
      );

      stream.on("data", onData);
      stream.on("end", onEnd);
      stream.on("error", onError);
      stream.on("close", onClose);
    });
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
