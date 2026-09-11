import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { noteAttachmentsQuery, noteByIdQuery, notesListQuery } from "./notes.queries";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  notes: { list: vi.fn(), get: vi.fn(), listAttachments: vi.fn() },
};

describe("notes queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("returns the note list on 200", async () => {
    const body = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    client.notes.list.mockResolvedValue({ status: 200, body });
    await expect(notesListQuery(1, 20).queryFn!({} as never)).resolves.toBe(body);
  });

  it("throws notFound for a missing note", async () => {
    client.notes.get.mockResolvedValue({ status: 404, body: null });
    await expect(noteByIdQuery("missing").queryFn!({} as never)).rejects.toThrow(
      "api.note.notFound",
    );
  });

  it("throws fetchFailed for server errors", async () => {
    client.notes.get.mockResolvedValue({ status: 500, body: null });
    await expect(noteByIdQuery("n-1").queryFn!({} as never)).rejects.toThrow(
      "api.note.fetchFailed",
    );
  });

  it("fetches attachments through the parent-owned endpoint", async () => {
    const body = { items: [], total: 0, page: 1, limit: 100, totalPages: 0 };
    client.notes.listAttachments.mockResolvedValue({ status: 200, body });
    await expect(noteAttachmentsQuery("n-1").queryFn!({} as never)).resolves.toBe(body);
    expect(client.notes.listAttachments).toHaveBeenCalledWith("n-1", { limit: 100 });
  });
});
