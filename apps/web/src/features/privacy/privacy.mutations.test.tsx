import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { renderHookWithProviders } from "@/test/utils";
import { useEraseAccountMutation, useRequestExportMutation } from "./privacy.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  privacy: { requestExport: vi.fn(), requestAccountErasure: vi.fn() },
};

describe("privacy mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("requests an export and invalidates the privacy subtree", async () => {
    const body = { id: "dsr-1" };
    client.privacy.requestExport.mockResolvedValue({ status: 200, body });
    const { result, queryClient } = renderHookWithProviders(() => useRequestExportMutation());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync(undefined);

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.privacy.all() });
  });

  it("throws exportFailed on non-200 responses", async () => {
    client.privacy.requestExport.mockResolvedValue({ status: 500, body: null });
    const { result } = renderHookWithProviders(() => useRequestExportMutation());

    await expect(result.current.mutateAsync(undefined)).rejects.toThrow("api.privacy.exportFailed");
  });

  it("sends the password confirmation when erasing an account", async () => {
    client.privacy.requestAccountErasure.mockResolvedValue({ status: 201, body: { id: "dsr-2" } });
    const { result } = renderHookWithProviders(() => useEraseAccountMutation());

    await result.current.mutateAsync("secret123");

    expect(client.privacy.requestAccountErasure).toHaveBeenCalledWith({
      password: "secret123",
    });
  });

  it("throws erasureFailed on non-201 responses", async () => {
    client.privacy.requestAccountErasure.mockResolvedValue({ status: 401, body: null });
    const { result } = renderHookWithProviders(() => useEraseAccountMutation());

    await expect(result.current.mutateAsync("wrong")).rejects.toThrow("api.privacy.erasureFailed");
  });
});
