import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelQueries: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn(),
  clearAuth: vi.fn(),
  setTenantId: vi.fn(),
}));

vi.mock("./query-client", () => ({
  getQueryClient: () => ({ cancelQueries: mocks.cancelQueries, clear: mocks.clear }),
}));
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: { getState: () => ({ clearAuth: mocks.clearAuth }) },
}));
vi.mock("@/stores/tenant.store", () => ({
  useTenantStore: { getState: () => ({ setTenantId: mocks.setTenantId }) },
}));

import { clearIdentityBoundary } from "./identity-boundary";

describe("clearIdentityBoundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels requests and removes all private state before another login", async () => {
    await clearIdentityBoundary();

    expect(mocks.cancelQueries).toHaveBeenCalledOnce();
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.setTenantId).toHaveBeenCalledWith(null);
    expect(mocks.clearAuth).toHaveBeenCalledOnce();
  });
});
