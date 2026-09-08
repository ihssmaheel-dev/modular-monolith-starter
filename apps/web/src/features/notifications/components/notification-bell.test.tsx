import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getApiClient } from "@/lib/api";
import { renderWithApp } from "@/test/utils";
import { NotificationBell } from "./notification-bell";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  notifications: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markAllRead: vi.fn(),
  },
};

const note = {
  id: "n-1",
  type: "user.welcome",
  category: "account",
  titleKey: "notifications.types.userWelcome",
  titleParams: { name: "Ada" },
  data: null,
  channels: ["inApp"],
  readAt: null,
  createdAt: "2026-03-15T12:00:00.000Z",
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    client.notifications.unreadCount.mockResolvedValue({ status: 200, body: { count: 0 } });
    client.notifications.list.mockResolvedValue({
      status: 200,
      body: { items: [], total: 0, page: 1, limit: 5, totalPages: 0 },
    });
  });

  it("renders the translated title key with params once opened", async () => {
    const user = userEvent.setup();
    client.notifications.unreadCount.mockResolvedValue({ status: 200, body: { count: 1 } });
    client.notifications.list.mockResolvedValue({
      status: 200,
      body: { items: [note], total: 1, page: 1, limit: 5, totalPages: 1 },
    });
    renderWithApp(<NotificationBell />);

    await user.click(await screen.findByRole("button", { name: /notifications/i }));

    expect(await screen.findByText("Welcome, Ada!")).toBeInTheDocument();
    expect(screen.queryByText("Welcome, {{name}}!")).not.toBeInTheDocument();
  });

  it("shows a retry affordance instead of an empty state on error", async () => {
    const user = userEvent.setup();
    client.notifications.list.mockRejectedValue(new Error("api.notifications.fetchFailed"));
    renderWithApp(<NotificationBell />);

    await user.click(await screen.findByRole("button", { name: /notifications/i }));

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });

  it("disables mark-all-read while the mutation is pending", async () => {
    const user = userEvent.setup();
    client.notifications.unreadCount.mockResolvedValue({ status: 200, body: { count: 2 } });
    let release!: () => void;
    client.notifications.markAllRead.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ status: 200, body: null });
      }),
    );
    renderWithApp(<NotificationBell />);

    await user.click(await screen.findByRole("button", { name: /notifications/i }));
    const markAll = await screen.findByRole("button", { name: /mark all/i });
    await user.click(markAll);

    expect(markAll).toBeDisabled();
    release();
  });
});
