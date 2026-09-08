import { describe, expect, it, vi, beforeEach } from "vitest";
import { useMutation } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/render-hook";
import { acceptInvitationMutationOptions } from "./tenancy.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { tenancy: { acceptInvitation: vi.fn() } };

describe("mobile tenancy mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("accepts an invitation with the raw token", async () => {
    client.tenancy.acceptInvitation.mockResolvedValue({ status: 200, body: { id: "m-1" } });
    const { result } = renderHookWithProviders(() =>
      useMutation(acceptInvitationMutationOptions()),
    );

    await result.current.mutateAsync("token-abc");

    expect(client.tenancy.acceptInvitation).toHaveBeenCalledWith({ body: { token: "token-abc" } });
  });

  it("throws acceptFailed on non-200 responses", async () => {
    client.tenancy.acceptInvitation.mockResolvedValue({ status: 410, body: null });
    const { result } = renderHookWithProviders(() =>
      useMutation(acceptInvitationMutationOptions()),
    );

    await expect(result.current.mutateAsync("stale")).rejects.toThrow("tenancy.acceptFailed");
  });
});
