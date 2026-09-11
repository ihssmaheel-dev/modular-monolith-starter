import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import {
  notificationsListQuery,
  preferencesQuery,
  unreadCountQuery,
} from "./notifications.queries";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  notifications: { list: vi.fn(), unreadCount: vi.fn(), getPreferences: vi.fn() },
};

describe("notifications queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("returns the notification page on 200", async () => {
    const body = { items: [], total: 0, page: 1, limit: 5, totalPages: 0 };
    client.notifications.list.mockResolvedValue({ status: 200, body });

    await expect(notificationsListQuery(1, 5).queryFn!({} as never)).resolves.toBe(body);
    expect(client.notifications.list).toHaveBeenCalledWith({ query: { page: 1, limit: 5 } });
  });

  it("throws fetchFailed when the list request fails", async () => {
    client.notifications.list.mockResolvedValue({ status: 500, body: null });

    await expect(notificationsListQuery(1, 5).queryFn!({} as never)).rejects.toThrow(
      "api.notifications.fetchFailed",
    );
  });

  it("unwraps the unread count", async () => {
    client.notifications.unreadCount.mockResolvedValue({ status: 200, body: { count: 3 } });

    await expect(unreadCountQuery().queryFn!({} as never)).resolves.toBe(3);
  });

  it("unwraps the preferences array", async () => {
    const preferences = [{ category: "account" }];
    client.notifications.getPreferences.mockResolvedValue({ status: 200, body: { preferences } });

    await expect(preferencesQuery().queryFn!({} as never)).resolves.toBe(preferences);
  });
});
