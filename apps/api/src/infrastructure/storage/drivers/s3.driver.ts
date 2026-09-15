import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  ChecksumMode,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../../config/env";
import {
  StorageDriver,
  FileInput,
  UPLOAD_PRESIGN_TTL_SECONDS,
  DOWNLOAD_PRESIGN_TTL_SECONDS,
} from "../storage.types";

const ACTIVE_OBJECT_TAG = "lifecycle=active";
const QUARANTINE_OBJECT_TAG = "lifecycle=quarantine";
const REQUIRED_UPLOAD_HEADERS = new Set(["content-type"]);

export class S3Driver implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      region: env.S3_REGION,
      ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }

  async upload(key: string, body: FileInput, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Tagging: ACTIVE_OBJECT_TAG,
      }),
    );
    return { key, url: `/${this.bucket}/${key}` };
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds = UPLOAD_PRESIGN_TTL_SECONDS,
  ) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
      Tagging: QUARANTINE_OBJECT_TAG,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: ttlSeconds,
      signableHeaders: REQUIRED_UPLOAD_HEADERS,
    });
  }

  async getPresignedDownloadUrl(key: string, ttlSeconds = DOWNLOAD_PRESIGN_TTL_SECONDS) {
    await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async copy(
    sourceKey: string,
    destinationKey: string,
    source: { etag?: string; versionId?: string },
  ) {
    const version = source.versionId ? `?versionId=${encodeURIComponent(source.versionId)}` : "";
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: `${this.bucket}/${sourceKey}${version}`,
        CopySourceIfMatch: source.etag,
        TaggingDirective: "REPLACE",
        Tagging: ACTIVE_OBJECT_TAG,
      }),
    );
  }

  async getMetadata(key: string) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ChecksumMode: ChecksumMode.ENABLED,
        }),
      );
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag,
        versionId: result.VersionId,
        checksumSha256: result.ChecksumSHA256,
      };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  async getDownloadStream(key: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!(result.Body instanceof Readable)) throw new Error("File stream unavailable");
    return result.Body;
  }

  private isNotFound(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const value = error as Record<string, unknown>;
    const metadata = value.$metadata;
    const status =
      typeof metadata === "object" && metadata !== null
        ? (metadata as Record<string, unknown>).httpStatusCode
        : undefined;
    return value.name === "NotFound" || status === 404;
  }

  getBucket(): string {
    return this.bucket;
  }
}
