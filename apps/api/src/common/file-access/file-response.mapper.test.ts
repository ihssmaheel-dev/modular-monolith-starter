import { afterEach, describe, expect, it } from "vitest";
import type { FileRecord } from "@repo/contracts";
import { env } from "../../config/env";
import { toFileResponse } from "./file-response.mapper";

const originalApiUrl = env.API_URL;

describe("file response mapping", () => {
  afterEach(() => {
    env.API_URL = originalApiUrl;
  });

  it("returns the authenticated download route instead of a storage object URL", () => {
    env.API_URL = "https://api.company.test";

    const response = toFileResponse(fileRecord());

    expect(response.url).toBe("https://api.company.test/api/v1/files/file-1/content");
    expect(response.url).not.toContain("private-bucket");
    expect(response.url).not.toContain("tenant-secret.pdf");
  });
});

function fileRecord(): FileRecord {
  return {
    id: "file-1",
    key: "tenants/tenant-1/general/user-1/tenant-secret.pdf",
    fileName: "tenant-secret.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    bucket: "private-bucket",
    parentType: "general",
    uploadedBy: "user-1",
    status: "uploaded",
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
    updatedAt: new Date("2026-09-15T00:00:00.000Z"),
  };
}
