import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { FileDrop } from "./file-drop";

function dropFile(zone: HTMLElement, file: File) {
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
}

function pdf(name: string, size = 6): File {
  return new File(["x".repeat(size)], name, { type: "application/pdf" });
}

describe("FileDrop", () => {
  const upload = vi.fn();
  const onUploaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ id: "f-1" });
  });

  it("rejects disallowed MIME types without calling upload", async () => {
    renderWithProviders(<FileDrop upload={upload} onUploaded={onUploaded} />);
    const zone = await screen.findByRole("button", { name: /drag files here/i });

    dropFile(zone, new File(["x"], "evil.exe", { type: "application/x-msdownload" }));

    expect(await screen.findByText("Invalid request")).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("rejects oversized files with the size key", async () => {
    renderWithProviders(<FileDrop upload={upload} maxSizeBytes={5} />);
    const zone = await screen.findByRole("button", { name: /drag files here/i });

    dropFile(zone, pdf("big.pdf"));

    expect(await screen.findByText("File exceeds the allowed size")).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("retries a single failed file without re-uploading the rest", async () => {
    const user = userEvent.setup();
    upload.mockRejectedValueOnce(new Error("api.error.quotaExceeded"));
    renderWithProviders(<FileDrop upload={upload} onUploaded={onUploaded} />);
    const zone = await screen.findByRole("button", { name: /drag files here/i });

    dropFile(zone, pdf("report.pdf"));

    expect(await screen.findByText("Storage quota exceeded")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onUploaded).toHaveBeenCalledWith(1);
  });

  it("clear-finished removes only finished rows", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileDrop upload={upload} onUploaded={onUploaded} />);
    const zone = await screen.findByRole("button", { name: /drag files here/i });

    dropFile(zone, pdf("done.pdf"));
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Clear finished" }));

    expect(screen.queryByText("done.pdf")).not.toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
