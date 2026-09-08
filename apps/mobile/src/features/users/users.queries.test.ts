import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { createTestQueryClient } from "@/test/render-hook";
import { usersListQuery } from "./users.queries";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { users: { list: vi.fn() } };

describe("mobile users queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("returns the user page on 200", async () => {
    const body = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    client.users.list.mockResolvedValue({ status: 200, body });

    await expect(createTestQueryClient().fetchQuery(usersListQuery(1, 20))).resolves.toBe(body);
    expect(client.users.list).toHaveBeenCalledWith({ query: { page: 1, limit: 20 } });
  });

  it("throws networkError when the listing fails", async () => {
    client.users.list.mockResolvedValue({ status: 500, body: null });

    await expect(createTestQueryClient().fetchQuery(usersListQuery(1, 20))).rejects.toThrow(
      "errors.networkError",
    );
  });
});
