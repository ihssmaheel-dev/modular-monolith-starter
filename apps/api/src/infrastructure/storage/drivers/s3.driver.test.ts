import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../../config/env";
import { S3Driver } from "./s3.driver";

const originalStorage = {
  endpoint: env.S3_ENDPOINT,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
};

describe("S3Driver upload signing", () => {
  afterEach(() => {
    env.S3_ENDPOINT = originalStorage.endpoint;
    env.S3_ACCESS_KEY_ID = originalStorage.accessKeyId;
    env.S3_SECRET_ACCESS_KEY = originalStorage.secretAccessKey;
    env.S3_FORCE_PATH_STYLE = originalStorage.forcePathStyle;
  });

  it("binds declared length and content type into a quarantined upload URL", async () => {
    env.S3_ENDPOINT = "http://localhost:9000";
    env.S3_ACCESS_KEY_ID = "test-access-key";
    env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    env.S3_FORCE_PATH_STYLE = true;

    const url = new URL(
      await new S3Driver().getPresignedUploadUrl("safe.quarantine", "image/png", 123, 60),
    );
    const headers = url.searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];

    expect(headers).toContain("content-length");
    expect(headers).toContain("content-type");
    expect(url.searchParams.get("x-amz-tagging")).toBe("lifecycle=quarantine");
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
    expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
  });

  it("sets attachment ResponseContentDisposition on download URL for browser safety", async () => {
    env.S3_ENDPOINT = "http://localhost:9000";
    env.S3_ACCESS_KEY_ID = "test-access-key";
    env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    env.S3_FORCE_PATH_STYLE = true;

    const url = new URL(
      await new S3Driver().getPresignedDownloadUrl("safe.pdf", 60, { filename: "report.pdf" }),
    );
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="report.pdf"',
    );
  });
});
