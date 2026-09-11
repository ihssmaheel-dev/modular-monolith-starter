import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { downloadExportFile, privacyRequestsQuery } from "./privacy.queries";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { privacy: { listRequests: vi.fn(), downloadExport: vi.fn() } };

describe("privacy queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the DSR page on 200", async () => {
    const body = { requests: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    client.privacy.listRequests.mockResolvedValue({ status: 200, body });

    await expect(privacyRequestsQuery(1, 20).queryFn!({} as never)).resolves.toBe(body);
    expect(client.privacy.listRequests).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("throws exportFailed when the request listing fails", async () => {
    client.privacy.listRequests.mockResolvedValue({ status: 500, body: null });

    await expect(privacyRequestsQuery(1, 20).queryFn!({} as never)).rejects.toThrow(
      "api.privacy.exportFailed",
    );
  });

  it("downloads the export snapshot and reports truncation", async () => {
    const snapshot = { truncated: true };
    client.privacy.downloadExport.mockResolvedValue({ status: 200, body: snapshot });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await expect(downloadExportFile("dsr-1", "my-data-export.json")).resolves.toEqual(snapshot);
    expect(client.privacy.downloadExport).toHaveBeenCalledWith("dsr-1");
  });

  it("throws exportFailed when the download is gone", async () => {
    client.privacy.downloadExport.mockResolvedValue({ status: 410, body: null });

    await expect(downloadExportFile("dsr-1", "my-data-export.json")).rejects.toThrow(
      "api.privacy.exportFailed",
    );
  });
});
