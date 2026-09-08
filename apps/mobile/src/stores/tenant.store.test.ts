import { describe, expect, it, vi, beforeEach } from "vitest";
import { getQueryClient } from "@/lib/query-client";
import { useTenantStore } from "./tenant.store";

vi.mock("@/lib/query-client", () => ({ getQueryClient: vi.fn() }));

const TENANT_A = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const TENANT_B = "3fa85f64-5717-4562-b3fc-2c963f66afa7";

describe("mobile tenant store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getQueryClient).mockReturnValue({ clear: vi.fn() } as never);
    useTenantStore.setState({ tenantId: null });
  });

  it("clears the query cache when switching tenants", () => {
    const clear = vi.mocked(getQueryClient)();
    useTenantStore.setState({ tenantId: TENANT_A });

    useTenantStore.getState().setTenantId(TENANT_B);

    expect(clear.clear).toHaveBeenCalledTimes(1);
    expect(useTenantStore.getState().tenantId).toBe(TENANT_B);
  });

  it("rejects malformed tenant ids without touching state", () => {
    useTenantStore.setState({ tenantId: TENANT_A });
    const clear = vi.mocked(getQueryClient)();

    useTenantStore.getState().setTenantId("not-a-uuid");

    expect(useTenantStore.getState().tenantId).toBe(TENANT_A);
    expect(clear.clear).not.toHaveBeenCalled();
  });

  it("accepts clearing the tenant back to null", () => {
    useTenantStore.setState({ tenantId: TENANT_A });

    useTenantStore.getState().setTenantId(null);

    expect(useTenantStore.getState().tenantId).toBeNull();
  });
});
