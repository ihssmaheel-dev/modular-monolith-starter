import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getApiClient } from "@/lib/api";
import { renderWithApp } from "@/test/utils";
import { ExportCard } from "./export-card";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const readyExport = {
  id: "dsr-1",
  type: "EXPORT",
  status: "READY",
  createdAt: "2026-03-15T12:00:00.000Z",
  expiresAt: "2026-03-22T12:00:00.000Z",
};

const client = {
  privacy: {
    listRequests: vi.fn(),
    requestExport: vi.fn(),
    downloadExport: vi.fn(),
  },
};

describe("ExportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    client.privacy.listRequests.mockResolvedValue({
      status: 200,
      body: { requests: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    });
  });

  it("lists ready exports with locale dates and expiry", async () => {
    client.privacy.listRequests.mockResolvedValue({
      status: 200,
      body: { requests: [readyExport], total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    renderWithApp(<ExportCard />);

    expect(await screen.findByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByText(/available until/i)).toBeInTheDocument();
  });

  it("recovers the download button after a failed download", async () => {
    client.privacy.listRequests.mockResolvedValue({
      status: 200,
      body: { requests: [readyExport], total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    client.privacy.downloadExport.mockResolvedValue({ status: 410, body: null });
    const user = userEvent.setup();
    renderWithApp(<ExportCard />);

    await user.click(await screen.findByRole("button", { name: "Download" }));

    expect(client.privacy.downloadExport).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Download" })).not.toBeDisabled();
  });

  it("completes a truncated download without getting stuck", async () => {
    client.privacy.listRequests.mockResolvedValue({
      status: 200,
      body: { requests: [readyExport], total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    client.privacy.downloadExport.mockResolvedValue({ status: 200, body: { truncated: true } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithApp(<ExportCard />);

    await user.click(await screen.findByRole("button", { name: "Download" }));

    expect(client.privacy.downloadExport).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Download" })).not.toBeDisabled();
  });

  it("disables the request button while an export is being prepared", async () => {
    let release!: () => void;
    client.privacy.requestExport.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ status: 200, body: { id: "dsr-2" } });
      }),
    );
    const user = userEvent.setup();
    renderWithApp(<ExportCard />);

    await user.click(await screen.findByRole("button", { name: "Request export" }));
    expect(screen.getByRole("button", { name: /preparing export/i })).toBeDisabled();
    release();
  });
});
