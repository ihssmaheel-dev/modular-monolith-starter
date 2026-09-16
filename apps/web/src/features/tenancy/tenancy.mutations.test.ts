import { describe, expect, it, vi, beforeEach } from "vitest";
import { useMutation } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/utils";
import {
  acceptInvitationMutationOptions,
  createOrganizationMutationOptions,
} from "./tenancy.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  tenancy: {
    acceptInvitation: vi.fn(),
    createOrganization: vi.fn(),
  },
};

describe("tenancy mutations", () => {
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

  it("creates an organization with name and slug", async () => {
    client.tenancy.createOrganization.mockResolvedValue({
      status: 201,
      body: { id: "org-123", name: "New Org", slug: "new-org" },
    });
    const { result } = renderHookWithProviders(() =>
      useMutation(createOrganizationMutationOptions()),
    );

    const created = await result.current.mutateAsync({ name: "New Org", slug: "new-org" });

    expect(client.tenancy.createOrganization).toHaveBeenCalledWith({
      body: { name: "New Org", slug: "new-org" },
    });
    expect(created.id).toBe("org-123");
  });

  it("throws createFailed on non-201 responses", async () => {
    client.tenancy.createOrganization.mockResolvedValue({ status: 400, body: null });
    const { result } = renderHookWithProviders(() =>
      useMutation(createOrganizationMutationOptions()),
    );

    await expect(result.current.mutateAsync({ name: "Fail" })).rejects.toThrow(
      "tenancy.createFailed",
    );
  });
});
