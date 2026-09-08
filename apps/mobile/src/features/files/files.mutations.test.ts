import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Linking } from "react-native";
import * as FileSystem from "expo-file-system";
import { uploadFile } from "@repo/api-client";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/render-hook";
import {
  openFileDownload,
  putBytesNative,
  useAttachNoteFileMutation,
  useDeleteFileMutation,
} from "./files.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));
vi.mock("@repo/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/api-client")>()),
  uploadFile: vi.fn(),
}));

const item = {
  uri: "file:///tmp/a.pdf",
  fileName: "a.pdf",
  contentType: "application/pdf",
  fileSize: 6,
  onProgress: () => undefined,
};

const client = {
  files: { delete: vi.fn(), getDownloadUrl: vi.fn() },
  notes: { attach: vi.fn() },
};

describe("mobile files mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    vi.mocked(uploadFile).mockResolvedValue({ id: "f-1" } as never);
  });

  it("attaches an uploaded file to its parent note", async () => {
    const attachment = { id: "att-1" };
    client.notes.attach.mockResolvedValue({ status: 201, body: attachment });
    const { result, queryClient } = renderHookWithProviders(() => useAttachNoteFileMutation("n-1"));
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync(item);

    expect(client.notes.attach).toHaveBeenCalledWith("n-1", "f-1", undefined);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["files"] });
  });

  it("throws uploadFailed when the attach call fails", async () => {
    client.notes.attach.mockResolvedValue({ status: 403, body: null });
    const { result } = renderHookWithProviders(() => useAttachNoteFileMutation("n-1"));

    await expect(result.current.mutateAsync(item)).rejects.toThrow("api.error.uploadFailed");
  });

  it("deletes a file and invalidates the files scope", async () => {
    client.files.delete.mockResolvedValue({ status: 204, body: null });
    const { result, queryClient } = renderHookWithProviders(() => useDeleteFileMutation());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync("f-1");

    expect(client.files.delete).toHaveBeenCalledWith({ params: { id: "f-1" } });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["files"] });
  });

  it("throws deleteFailed unless the server returns 204", async () => {
    client.files.delete.mockResolvedValue({ status: 500, body: null });
    const { result } = renderHookWithProviders(() => useDeleteFileMutation());

    await expect(result.current.mutateAsync("f-1")).rejects.toThrow("api.error.deleteFailed");
  });

  it("opens the download URL through Linking", async () => {
    client.files.getDownloadUrl.mockResolvedValue({
      status: 200,
      body: { downloadUrl: "https://cdn.test/a.pdf" },
    });

    await openFileDownload("f-1");

    expect(client.files.getDownloadUrl).toHaveBeenCalledWith({ params: { id: "f-1" } });
    expect(vi.mocked(Linking.openURL)).toHaveBeenCalledWith("https://cdn.test/a.pdf");
  });

  it("throws internal when the download URL request fails", async () => {
    client.files.getDownloadUrl.mockResolvedValue({ status: 404, body: null });

    await expect(openFileDownload("missing")).rejects.toThrow("api.error.internal");
    expect(vi.mocked(Linking.openURL)).not.toHaveBeenCalled();
  });
});

describe("putBytesNative", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs the decoded bytes with the content type", async () => {
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue("eA==");
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetch);

    await putBytesNative("https://cdn.test/up", "file:///tmp/a.pdf", "application/pdf");

    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith("file:///tmp/a.pdf", {
      encoding: "base64",
    });
    const [, init] = fetch.mock.calls[0] as [
      string,
      { method: string; headers: object; body: unknown },
    ];
    expect(fetch.mock.calls[0]?.[0]).toBe("https://cdn.test/up");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "application/pdf" });
    expect(Array.from(init.body as Uint8Array)).toEqual([120]);
  });

  it("throws with the status when the PUT is rejected", async () => {
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue("eA==");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(
      putBytesNative("https://cdn.test/up", "file:///tmp/a.pdf", "text/plain"),
    ).rejects.toThrow("PUT failed with status 500");
  });
});
