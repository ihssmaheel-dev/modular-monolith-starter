import { describe, expect, it, vi, beforeEach } from "vitest";
import { uploadFile } from "@repo/api-client";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/utils";
import {
  downloadFileById,
  useAttachNoteFileMutation,
  useDeleteFileMutation,
} from "./files.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));
vi.mock("@repo/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/api-client")>()),
  uploadFile: vi.fn(),
}));

const file = () => new File(["x"], "a.pdf", { type: "application/pdf" });

const client = {
  files: { delete: vi.fn(), getDownloadUrl: vi.fn() },
  notes: { attach: vi.fn() },
};

describe("files mutations", () => {
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

    await result.current.mutateAsync({ file: file(), onProgress: () => undefined });

    expect(client.notes.attach).toHaveBeenCalledWith("n-1", "f-1", undefined);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["files"] });
  });

  it("throws uploadFailed when the attach call fails", async () => {
    client.notes.attach.mockResolvedValue({ status: 403, body: null });
    const { result } = renderHookWithProviders(() => useAttachNoteFileMutation("n-1"));

    await expect(
      result.current.mutateAsync({ file: file(), onProgress: () => undefined }),
    ).rejects.toThrow("api.error.uploadFailed");
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

  it("throws internal when the download URL request fails", async () => {
    client.files.getDownloadUrl.mockResolvedValue({ status: 404, body: null });

    await expect(downloadFileById("missing", "a.pdf")).rejects.toThrow("api.error.internal");
    expect(client.files.getDownloadUrl).toHaveBeenCalledWith({ params: { id: "missing" } });
  });
});
