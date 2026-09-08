import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/render-hook";
import {
  useEraseAccountMutation,
  useEraseOrganizationMutation,
  useRequestExportMutation,
} from "./privacy.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  privacy: {
    requestExport: vi.fn(),
    requestAccountErasure: vi.fn(),
    requestOrganizationErasure: vi.fn(),
  },
};

describe("mobile privacy mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("requests an export and forwards the id to onSuccess", async () => {
    client.privacy.requestExport.mockResolvedValue({ status: 200, body: { id: "dsr-1" } });
    const onSuccess = vi.fn();
    const { result, queryClient } = renderHookWithProviders(() =>
      useRequestExportMutation({ onSuccess }),
    );
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync(undefined);

    expect(spy).toHaveBeenCalledWith({ queryKey: ["privacy"] });
    expect(onSuccess).toHaveBeenCalledWith("dsr-1");
  });

  it("throws exportFailed when the export request fails", async () => {
    client.privacy.requestExport.mockResolvedValue({ status: 429, body: null });
    const { result } = renderHookWithProviders(() => useRequestExportMutation());

    await expect(result.current.mutateAsync(undefined)).rejects.toThrow("api.privacy.exportFailed");
  });

  it("schedules account erasure with the password confirmation", async () => {
    client.privacy.requestAccountErasure.mockResolvedValue({ status: 201, body: { id: "dsr-2" } });
    const onSuccess = vi.fn();
    const { result } = renderHookWithProviders(() => useEraseAccountMutation({ onSuccess }));

    await result.current.mutateAsync("Password123!");

    expect(client.privacy.requestAccountErasure).toHaveBeenCalledWith({
      password: "Password123!",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("throws erasureFailed when account erasure is rejected", async () => {
    client.privacy.requestAccountErasure.mockResolvedValue({ status: 401, body: null });
    const { result } = renderHookWithProviders(() => useEraseAccountMutation());

    await expect(result.current.mutateAsync("wrong")).rejects.toThrow("api.privacy.erasureFailed");
  });

  it("schedules organization erasure and invalidates privacy", async () => {
    client.privacy.requestOrganizationErasure.mockResolvedValue({
      status: 201,
      body: { id: "dsr-3" },
    });
    const { result, queryClient } = renderHookWithProviders(() => useEraseOrganizationMutation());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync({ organizationId: "org-1", confirmationName: "Acme" });

    expect(client.privacy.requestOrganizationErasure).toHaveBeenCalledWith("org-1", {
      confirmationName: "Acme",
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["privacy"] });
  });
});
