import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { createTestQueryClient } from "@/test/render-hook";
import { filesListQuery } from "./files.queries";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { files: { listByParent: vi.fn() } };

describe("mobile files queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("lists attachments through the parent-scoped endpoint", async () => {
    const body = { items: [], total: 0, page: 1, limit: 100, totalPages: 0 };
    client.files.listByParent.mockResolvedValue({ status: 200, body });

    await expect(createTestQueryClient().fetchQuery(filesListQuery("note", "n-1"))).resolves.toBe(
      body,
    );
    expect(client.files.listByParent).toHaveBeenCalledWith({
      query: { parentType: "note", parentId: "n-1", limit: 100 },
    });
  });

  it("throws internal when the listing fails", async () => {
    client.files.listByParent.mockResolvedValue({ status: 500, body: null });

    await expect(createTestQueryClient().fetchQuery(filesListQuery("general"))).rejects.toThrow(
      "api.error.internal",
    );
  });
});
