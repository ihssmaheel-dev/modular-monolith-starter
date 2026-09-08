import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { createTestQueryClient } from "@/test/render-hook";
import { privacyRequestsQuery } from "./privacy.queries";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { privacy: { listRequests: vi.fn() } };

describe("mobile privacy queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("returns the DSR page on 200", async () => {
    const body = { requests: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    client.privacy.listRequests.mockResolvedValue({ status: 200, body });

    await expect(createTestQueryClient().fetchQuery(privacyRequestsQuery(1, 20))).resolves.toBe(
      body,
    );
    expect(client.privacy.listRequests).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("throws exportFailed when the request listing fails", async () => {
    client.privacy.listRequests.mockResolvedValue({ status: 500, body: null });

    await expect(createTestQueryClient().fetchQuery(privacyRequestsQuery(1, 20))).rejects.toThrow(
      "api.privacy.exportFailed",
    );
  });
});
