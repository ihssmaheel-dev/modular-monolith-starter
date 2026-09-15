import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageService } from "./storage.service";
import type { PinoLoggerService } from "../logger/logger.service";

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
    STORAGE_DRIVER: "s3",
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "test-bucket",
    S3_ACCESS_KEY_ID: "minioadmin",
    S3_SECRET_ACCESS_KEY: "minioadmin",
    S3_FORCE_PATH_STYLE: true,
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
  },
}));

vi.mock("./drivers/s3.driver", () => {
  return {
    S3Driver: class {
      upload = vi.fn().mockResolvedValue({ url: "test", key: "test" });
      delete = vi.fn().mockResolvedValue(undefined);
      getPresignedDownloadUrl = vi.fn().mockResolvedValue("http://dl");
      getPresignedUploadUrl = vi.fn().mockResolvedValue("http://ul");
      getMetadata = vi.fn().mockResolvedValue({ size: 4, contentType: "text/plain" });
      getDownloadStream = vi.fn().mockResolvedValue({ pipe: vi.fn() });
    },
  };
});

describe("StorageService", () => {
  let service: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    mockLogger.child = () => mockLogger;

    service = new StorageService(mockLogger);
  });

  it("should upload file successfully", async () => {
    const result = await service.upload("file.txt", Buffer.from("test"), "text/plain");
    expect(result.isOk()).toBe(true);
  });

  it("should delete file successfully", async () => {
    const result = await service.delete("file.txt");
    expect(result.isOk()).toBe(true);
  });

  it("should get presigned download url", async () => {
    const result = await service.getPresignedDownloadUrl("file.txt");
    expect(result.isOk()).toBe(true);
  });

  it("should get presigned upload url", async () => {
    const result = await service.getPresignedUploadUrl("file.txt", "text/plain", 12);
    expect(result.isOk()).toBe(true);
  });

  it("should read stored object metadata", async () => {
    const result = await service.getMetadata("file.txt");
    expect(result.isOk() && result.value?.size).toBe(4);
  });
});
