import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { getApiClient } from "@/lib/api";
import { renderWithApp } from "@/test/utils";
import { NotificationsFeed } from "./notifications-feed";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

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

const client = {
  notifications: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
};

function pageOf(total: number, page = 1) {
  return {
    status: 200,
    body: { items: [note], total, page, limit: 1, totalPages: total },
  };
}

function renderFeed() {
  const Harness = () => {
    const [page, setPage] = useState(1);
    return <NotificationsFeed page={page} limit={20} onPageChange={setPage} />;
  };
  return renderWithApp(<Harness />);
}

describe("NotificationsFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("interpolates title params instead of showing raw placeholders", async () => {
    client.notifications.list.mockResolvedValue({
      status: 200,
      body: { items: [note], total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    renderFeed();

    expect(await screen.findByText("Welcome, Ada!")).toBeInTheDocument();
  });

  it("shows an error with retry instead of a false empty state", async () => {
    client.notifications.list.mockRejectedValue(new Error("api.notifications.fetchFailed"));
    renderFeed();

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });

  it("disables the row while its mark-read mutation is pending", async () => {
    const user = userEvent.setup();
    client.notifications.list.mockResolvedValue({
      status: 200,
      body: { items: [note], total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    let release!: () => void;
    client.notifications.markRead.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ status: 200, body: { ...note, readAt: "2026-03-16T00:00:00Z" } });
      }),
    );
    renderFeed();

    await user.click(await screen.findByText("Welcome, Ada!"));
    expect(screen.getByRole("button", { name: /welcome, ada!/i })).toBeDisabled();
    release();
  });

  it("marks everything read from the header action", async () => {
    const user = userEvent.setup();
    client.notifications.list.mockResolvedValue({
      status: 200,
      body: { items: [note], total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    client.notifications.markAllRead.mockResolvedValue({ status: 200, body: null });
    renderFeed();

    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));

    expect(client.notifications.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("forwards pagination through to the parent", async () => {
    const user = userEvent.setup();
    client.notifications.list.mockResolvedValue(pageOf(2));
    const onPageChange = vi.fn();
    const Paged = () => <NotificationsFeed page={1} limit={1} onPageChange={onPageChange} />;
    renderWithApp(<Paged />);

    await user.click(await screen.findByRole("button", { name: "Next" }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
