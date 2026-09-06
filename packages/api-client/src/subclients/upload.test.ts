import { describe, it, expect, vi } from "vitest";
import { uploadFile, validateUploadSource, type PutBytes } from "./upload";

const SOURCE = {
  fileName: "a.pdf",
  contentType: "application/pdf",
  fileSize: 1024,
  body: new Uint8Array([1, 2, 3]),
};

function stubClient(overrides: Record<string, unknown> = {}) {
  return {
    requestUpload: vi.fn().mockResolvedValue({
      status: 201,
      body: { uploadMode: "direct", uploadUrl: "https://s3.example.com/u", fileKey: "k" },
    }),
    confirmUpload: vi.fn().mockResolvedValue({
      status: 200,
      body: { id: "file-1", key: "k" },
    }),
    ...overrides,
  };
}

describe("validateUploadSource", () => {
  it("should reject disallowed content types", () => {
    expect(() => validateUploadSource({ ...SOURCE, contentType: "video/mp4" })).toThrow(
      "api.error.invalidRequest",
    );
  });

  it("should reject oversized files", () => {
    expect(() => validateUploadSource({ ...SOURCE, fileSize: 1024 * 1024 * 1024 })).toThrow(
      "api.error.fileTooLarge",
    );
  });
});

describe("uploadFile", () => {
  it("should request, put, and confirm in order without any parent", async () => {
    const client = stubClient();
    const putBytes: PutBytes = vi.fn().mockResolvedValue(undefined);

    const file = await uploadFile(client, SOURCE, putBytes);

    expect(client.requestUpload).toHaveBeenCalledWith({
      body: expect.not.objectContaining({ parentType: expect.anything() }),
    });
    expect(putBytes).toHaveBeenCalledWith(
      "https://s3.example.com/u",
      SOURCE.body,
      SOURCE.contentType,
    );
    expect(client.confirmUpload).toHaveBeenCalledWith({ body: { fileKey: "k" } });
    expect(file).toEqual({ id: "file-1", key: "k" });
  });

  it("should surface the server i18n key when requesting fails", async () => {
    const client = stubClient({
      requestUpload: vi.fn().mockResolvedValue({
        status: 413,
        body: null,
        error: { i18nKey: "api.error.quotaExceeded" },
      }),
    });

    await expect(uploadFile(client, SOURCE, vi.fn())).rejects.toThrow("api.error.quotaExceeded");
  });

  it("should throw uploadFailed when the PUT fails", async () => {
    const client = stubClient();
    const putBytes: PutBytes = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(uploadFile(client, SOURCE, putBytes)).rejects.toThrow("api.error.uploadFailed");
    expect(client.confirmUpload).not.toHaveBeenCalled();
  });

  it("should throw uploadFailed when confirm fails", async () => {
    const client = stubClient({
      confirmUpload: vi.fn().mockResolvedValue({ status: 500, body: null }),
    });

    await expect(uploadFile(client, SOURCE, vi.fn())).rejects.toThrow("api.error.uploadFailed");
  });
});
