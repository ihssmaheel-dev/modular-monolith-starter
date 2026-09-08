import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/utils";
import {
  useMarkAllReadMutation,
  useMarkReadMutation,
  useUpdatePreferencesMutation,
} from "./notifications.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  notifications: { markRead: vi.fn(), markAllRead: vi.fn(), updatePreferences: vi.fn() },
};

describe("notifications mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("marks a row read and invalidates the notifications scope", async () => {
    client.notifications.markRead.mockResolvedValue({ status: 200, body: { id: "n-1" } });
    const { result, queryClient } = renderHookWithProviders(() => useMarkReadMutation());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync("n-1");

    expect(client.notifications.markRead).toHaveBeenCalledWith("n-1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });

  it("throws notFound when the row is already gone", async () => {
    client.notifications.markRead.mockResolvedValue({ status: 404, body: null });
    const { result } = renderHookWithProviders(() => useMarkReadMutation());

    await expect(result.current.mutateAsync("gone")).rejects.toThrow("api.notifications.notFound");
  });

  it("marks everything read in one call", async () => {
    client.notifications.markAllRead.mockResolvedValue({ status: 200, body: null });
    const { result } = renderHookWithProviders(() => useMarkAllReadMutation());

    await result.current.mutateAsync(undefined);

    expect(client.notifications.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("sends the preference draft and invalidates preferences", async () => {
    const preferences = [{ category: "account" }];
    client.notifications.updatePreferences.mockResolvedValue({
      status: 200,
      body: { preferences },
    });
    const { result, queryClient } = renderHookWithProviders(() => useUpdatePreferencesMutation());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync(preferences as never);

    expect(client.notifications.updatePreferences).toHaveBeenCalledWith({ preferences });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["notifications", "preferences"] });
  });
});
